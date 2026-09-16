"""Full-universe enumeration of GitHub repositories at or above a star threshold.

Why this script exists
----------------------
``backfill_worker.py`` and ``harvest_scale.py`` both drive the GraphQL *search*
endpoint, which GitHub truncates at 1,000 results per query regardless of how
deep you paginate.  Those scripts sweep a fixed list of ~12 coarse star windows,
so a single run can capture at most ``12 x 1000 = 12,000`` records (and
``harvest_scale.py`` only paginates 2 pages of 40, i.e. ~960 records).  They are
therefore structurally unable to close a ~72k-record gap, no matter how many
times they are re-run.

This driver removes that ceiling by *partitioning* the star continuum instead of
sampling it:

1. Planning phase - recursively bisect the star range, probing
   ``search.repositoryCount`` until every window holds at most 1,000 repos
   (the searchable cap).  A window whose star range is atomic but still holds
   more than 1,000 repos is split further on its fork-count range.
2. Harvest phase - paginate each window with cursor pagination (100 nodes per
   page, <= 10 pages), running windows concurrently.  GraphQL search costs 1
   point per request against this token's ~8100 point/minute budget, so the
   binding constraint is latency rather than quota.
3. Everything is appended to a resumable JSONL checkpoint, so an interrupted
   run continues where it left off instead of re-fetching.

Output: one raw record per line (JSON) in ``--output``, shaped exactly like the
``raw`` dict inside ``backfill_worker.py`` so ``taxonomy_engine`` can consume it
unchanged.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

API = "https://api.github.com/graphql"
MAX_RESULTS_PER_QUERY = 1000   # hard GitHub search cap (10 pages x 100 nodes)
PAGE_SIZE = 100

SEARCH_QUERY = """
query($q: String!, $cursor: String) {
  rateLimit { remaining resetAt }
  search(query: $q, type: REPOSITORY, first: %d, after: $cursor) {
    repositoryCount
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Repository {
        databaseId
        name
        owner { login }
        description
        stargazerCount
        forkCount
        primaryLanguage { name }
        licenseInfo { spdxId name }
        repositoryTopics(first: 8) { nodes { topic { name } } }
        pushedAt
      }
    }
  }
}
""" % PAGE_SIZE

COUNT_QUERY = """
query($q: String!) {
  search(query: $q, type: REPOSITORY, first: 1) { repositoryCount }
}
"""


class Backoff(Exception):
    pass


class Limiter:
    """Coarse global throttle so concurrent workers do not trip abuse detection."""

    def __init__(self, rps: float):
        self.interval = 1.0 / rps if rps > 0 else 0.0
        self.lock = threading.Lock()
        self.next_at = 0.0

    def wait(self):
        if self.interval <= 0:
            return
        with self.lock:
            now = time.monotonic()
            slot = max(now, self.next_at)
            self.next_at = slot + self.interval
        delay = slot - time.monotonic()
        if delay > 0:
            time.sleep(delay)


class GitHub:
    def __init__(self, token: str, limiter: Limiter, attempts: int = 6):
        self.token = token
        self.limiter = limiter
        self.attempts = attempts

    def run(self, query: str, variables: dict) -> dict:
        body = json.dumps({"query": query, "variables": variables}).encode("utf-8")
        last_error = None
        for attempt in range(self.attempts):
            self.limiter.wait()
            req = urllib.request.Request(
                API,
                data=body,
                headers={
                    "Authorization": f"Bearer {self.token}",
                    "Content-Type": "application/json",
                    "User-Agent": "GitScour-Backfill/2.0",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=60) as resp:
                    payload = json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                detail = ""
                try:
                    detail = exc.read().decode("utf-8")[:200]
                except Exception:
                    pass
                if exc.code in (403, 429) or "rate limit" in detail.lower():
                    sleep_for = float(retry_after) if retry_after else min(60.0, 2.0 ** attempt)
                    raise Backoff(f"HTTP {exc.code} rate limited; sleeping {sleep_for:.0f}s")
                last_error = f"HTTP {exc.code} {detail}"
                # 422 (malformed query) will never succeed; bail out early.
                if exc.code == 422:
                    raise RuntimeError(last_error)
                time.sleep(min(30.0, 1.5 ** attempt))
                continue
            except Exception as exc:  # network hiccup / timeout
                last_error = f"{type(exc).__name__}: {exc}"
                time.sleep(min(30.0, 1.5 ** attempt))
                continue

            if payload.get("errors"):
                msgs = "; ".join(e.get("message", "?") for e in payload["errors"])
                if "rate limit" in msgs.lower() or "secondary" in msgs.lower():
                    raise Backoff(f"graphql rate limit: {msgs[:120]}")
                last_error = f"graphql errors: {msgs[:200]}"
                time.sleep(min(30.0, 1.5 ** attempt))
                continue

            data = payload.get("data") or {}
            rate = data.get("rateLimit") or {}
            if rate and rate.get("remaining") is not None and rate["remaining"] < 120:
                reset = rate.get("resetAt")
                raise Backoff(f"graphql budget low ({rate['remaining']} left, reset {reset})")
            return data

        raise RuntimeError(last_error or "unknown graphql failure")


def window_clause(star_lo: int, star_hi: int, fork_lo: int | None, fork_hi: int | None) -> str:
    stars = f"stars:{star_lo}" if star_lo == star_hi else f"stars:{star_lo}..{star_hi}"
    if fork_lo is not None:
        forks = f" forks:{fork_lo}" if fork_lo == (fork_hi or fork_lo) else f" forks:{fork_lo}..{fork_hi}"
    else:
        forks = ""
    return f"{stars}{forks} sort:stars-desc"


def probe_count(gh: GitHub, clause: str, retries: int = 8) -> int:
    for attempt in range(retries):
        try:
            data = gh.run(COUNT_QUERY, {"q": clause})
            return int((data.get("search") or {}).get("repositoryCount") or 0)
        except Backoff as exc:
            time.sleep(min(90.0, 5.0 * (attempt + 1)) + random.uniform(0, 2))
        except RuntimeError:
            return 0
    return 0


def plan_windows(gh: GitHub, star_lo: int, star_hi: int, concurrency: int, log) -> list[dict]:
    """Bisect the star range until every window fits inside the search cap."""
    frontier = [{"star_lo": star_lo, "star_hi": star_hi, "fork_lo": None, "fork_hi": None}]
    leaves: list[dict] = []
    probed = 0
    while frontier:
        with ThreadPoolExecutor(max_workers=concurrency) as pool:
            results = list(pool.map(lambda w: probe_count(gh, window_clause(**{k: w[k] for k in ("star_lo", "star_hi", "fork_lo", "fork_hi")})), frontier))
        probed += len(results)
        nxt: list[dict] = []
        for w, count in zip(frontier, results):
            if count == 0:
                continue
            if count <= MAX_RESULTS_PER_QUERY:
                w["count"] = count
                leaves.append(w)
                continue
            lo, hi = w["star_lo"], w["star_hi"]
            if lo < hi:  # split on the star axis
                mid = (lo + hi) // 2
                if mid < lo or mid >= hi:
                    mid = hi - 1
                nxt.append({**w, "star_hi": mid})
                nxt.append({**w, "star_lo": mid + 1})
            elif w["fork_lo"] is None:  # atomic star value: split on fork range
                fhi = max(1000, (count // 900) * 2)
                nxt.append({**w, "fork_lo": 0, "fork_hi": fhi})
                nxt.append({**w, "fork_lo": fhi + 1, "fork_hi": None})
            else:  # both axes exhausted for this window
                w["count"] = count
                w["truncated"] = True
                leaves.append(w)
                log(f"  ! window {w} holds {count} repos but cannot split further")
        log(f"  planning: {len(leaves)} windows locked, {len(nxt)} splitting, {probed} probes")
        frontier = nxt
    leaves.sort(key=lambda w: -w["star_hi"])
    return leaves


class Checkpoint:
    """Append-only JSONL sink + set of completed windows, safe across threads."""

    def __init__(self, path: str, manifest_path: str):
        self.path = path
        self.manifest_path = manifest_path
        self.lock = threading.Lock()
        self.done = set()
        if os.path.exists(manifest_path):
            with open(manifest_path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if line:
                        self.done.add(line)
        self.fh = open(path, "a", encoding="utf-8")
        self.mh = open(manifest_path, "a", encoding="utf-8")
        self.seen = set()

    def key(self, rec: dict) -> str:
        return f"{rec['owner']}/{rec['name']}".lower()

    def harvest_count(self) -> int:
        return len(self.done)

    def write_records(self, records: list[dict]):
        with self.lock:
            for rec in records:
                k = self.key(rec)
                if k in self.seen:
                    continue
                self.seen.add(k)
                self.fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
            self.fh.flush()
            os.fsync(self.fh.fileno())

    def complete(self, window: dict):
        with self.lock:
            self.mh.write(json.dumps(window, sort_keys=True) + "\n")
            self.mh.flush()
            self.done.add(json.dumps(window, sort_keys=True))


def harvest_window(gh: GitHub, window: dict) -> tuple[dict, list[dict], int]:
    clause = window_clause(window["star_lo"], window["star_hi"], window.get("fork_lo"), window.get("fork_hi"))
    records: list[dict] = []
    cursor = None
    pages = 0
    retries = 0
    while pages < (MAX_RESULTS_PER_QUERY // PAGE_SIZE):
        try:
            data = gh.run(SEARCH_QUERY, {"q": clause, "cursor": cursor})
        except Backoff as exc:
            retries += 1
            if retries > 12:
                raise
            log_delay = min(90.0, 5.0 * retries) + random.uniform(0, 2)
            time.sleep(log_delay)
            continue
        except RuntimeError:
            break
        pages += 1
        search = data.get("search") or {}
        for node in search.get("nodes") or []:
            if not node or not node.get("databaseId"):
                continue
            lic = node.get("licenseInfo") or {}
            records.append({
                "id": node["databaseId"],
                "name": node["name"],
                "owner": (node.get("owner") or {}).get("login", ""),
                "description": node.get("description") or "",
                "stars": node.get("stargazerCount", 0),
                "forks": node.get("forkCount", 0),
                "language": (node.get("primaryLanguage") or {}).get("name") or "Other",
                "license": lic.get("spdxId") or lic.get("name") or "Unknown",
                "topics": [t["topic"]["name"] for t in node.get("repositoryTopics", {}).get("nodes", []) if t.get("topic")],
                "pushed_at": node.get("pushedAt"),
            })
        info = search.get("pageInfo") or {}
        if not info.get("hasNextPage"):
            break
        cursor = info.get("endCursor")
    return window, records, retries


def main() -> int:
    parser = argparse.ArgumentParser(description="Enumerate every GitHub repo above a star threshold")
    parser.add_argument("--min-stars", type=int, default=500)
    parser.add_argument("--max-stars", type=int, default=2_000_000, help="upper bound of the star sweep")
    parser.add_argument("--output", default="/home/user/harvest/raw_repos.jsonl")
    parser.add_argument("--manifest", default="/home/user/harvest/windows_done.jsonl")
    parser.add_argument("--concurrency", type=int, default=12)
    parser.add_argument("--rps", type=float, default=18.0, help="global request cap per second")
    parser.add_argument("--dry-plan", action="store_true", help="only print the window plan")
    args = parser.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("Error: GITHUB_TOKEN or GH_TOKEN is required.", file=sys.stderr)
        return 1

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    t0 = time.time()
    start_wall = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    log = lambda msg: print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

    limiter = Limiter(args.rps)
    gh = GitHub(token, limiter)
    ckpt = Checkpoint(args.output, args.manifest)

    log(f"start={start_wall} threshold>={args.min_stars} concurrency={args.concurrency} rps={args.rps}")
    log("planning star windows (each <= %d repos)..." % MAX_RESULTS_PER_QUERY)
    windows = plan_windows(gh, args.min_stars, args.max_stars, args.concurrency, log)
    planned_total = sum(w.get("count", 0) for w in windows)
    log(f"plan complete: {len(windows)} windows, universe estimate {planned_total} repos ({time.time()-t0:.0f}s)")

    if args.dry_plan:
        for w in windows:
            print(json.dumps(w))
        return 0

    pending = [w for w in windows if json.dumps(w, sort_keys=True) not in ckpt.done]
    log(f"{len(windows) - len(pending)} windows already checkpointed, {len(pending)} to harvest")

    done_lock = threading.Lock()
    finished = 0
    truncated = 0

    def work(window):
        nonlocal finished, truncated
        try:
            w, records, retries = harvest_window(gh, window)
        except Exception as exc:
            with done_lock:
                log(f"  x window {window['star_lo']}..{window['star_hi']} failed: {exc}")
            return
        ckpt.write_records(records)
        ckpt.complete(window)
        with done_lock:
            finished += 1
            truncated += 1 if window.get("truncated") else 0
            per_min = ckpt.harvest_count() / max(1e-6, (time.time() - t0) / 60.0)
            log(f"  [{finished}/{len(pending)}] stars:{window['star_lo']}..{window['star_hi']} "
                f"+{len(records)} recs | {ckpt.harvest_count()} windows done | {per_min:.0f} windows/min"
                + (f" | {retries} retries" if retries else ""))

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        list(as_completed([pool.submit(work, w) for w in pending]))

    stats_path = os.path.join(os.path.dirname(os.path.abspath(args.output)), "stats.json")
    with open(stats_path, "w", encoding="utf-8") as fh:
        json.dump({
            "started": start_wall,
            "elapsed_s": round(time.time() - t0, 1),
            "windows_planned": len(windows),
            "windows_done": len(ckpt.done),
            "windows_truncated": truncated,
            "universe_estimate": planned_total,
        }, fh, indent=2)

    log(f"DONE: {len(ckpt.done)} windows in {time.time()-t0:.0f}s -> {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

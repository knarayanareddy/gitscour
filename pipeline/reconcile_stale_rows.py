"""Reconcile catalog rows that the live universe sweep could not match.

A committed row that the fresh harvest does not contain is one of:

  * **renamed / transferred** -- GitHub answers `/repos/{old}` with a redirect to
    the repo's canonical endpoint, and the response body carries the *current*
    `full_name`;
  * **deleted, private, or taken down** (404 / 403 / 451);
  * **dropped below the star threshold** (star purges happen);
  * **live but unindexed** by search (recently transferred, spam-filtered).

Without this pass a rename leaves the catalog holding the same project twice --
the stale row plus the harvested row under its new name -- because the merge keys
on `owner/name`.  Emit a patch that `rebuild_catalog.py --reconcile` applies:

    {"drop": ["owner/name", ...], "update": {"owner/name": {...current fields...}}}
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import sys
import time
import urllib.error
import urllib.request

API = "https://api.github.com"


def catalog_keys(path: str) -> dict:
    """{lowercase full_name: packed row} from the Tier-1 packed index."""
    with open(path, "r", encoding="utf-8") as fh:
        packed = json.load(fh)
    out = {}
    for row in packed["rows"]:
        out[f"{row[2]}/{row[1]}".lower()] = row
    return out


def harvest_keys(path: str) -> set:
    keys = set()
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            keys.add(f"{r['owner']}/{r['name']}".lower())
    return keys


def resolve(token: str, key: str, min_stars: int):
    owner, _, name = key.partition("/")
    req = urllib.request.Request(
        f"{API}/repos/{owner}/{name}",
        headers={"Authorization": f"Bearer {token}", "User-Agent": "GitScour-Reconcile",
                 "Accept": "application/vnd.github+json"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                body = json.loads(resp.read().decode())
                break
        except urllib.error.HTTPError as exc:
            retry_after = exc.headers.get("Retry-After") if exc.headers else None
            throttled = exc.code == 429 or (exc.code == 403 and (retry_after or exc.headers.get("X-RateLimit-Remaining") == "0"))
            if throttled:
                time.sleep(float(retry_after) if retry_after else 5.0 * (attempt + 1))
                continue
            if exc.code == 404:
                return {"key": key, "verdict": "deleted"}
            if exc.code in (451, 403, 401):
                # legal takedown, private, or access denied -> not listable
                return {"key": key, "verdict": "blocked", "http": exc.code}
            if exc.code in (409, 422):
                # 409 = exists but has no commits
                return {"key": key, "verdict": "empty_repo"}
            return {"key": key, "verdict": "error", "http": exc.code}
        except Exception:
            time.sleep(2.0 * (attempt + 1))
    else:
        return {"key": key, "verdict": "error"}

    stars = int(body.get("stargazers_count") or 0)
    current = (body.get("full_name") or "").lower()
    lic = body.get("license") or {}
    record = {
        "id": body.get("id"),
        "name": body.get("name"),
        "owner": (body.get("owner") or {}).get("login"),
        "description": body.get("description") or "",
        "stars": stars,
        "forks": int(body.get("forks_count") or 0),
        "language": body.get("language") or "Other",
        "license": (lic.get("spdx_id") or lic.get("name") or "Unknown") if isinstance(lic, dict) else "Unknown",
        "topics": body.get("topics") or [],
        "pushed_at": body.get("pushed_at"),
    }
    if stars < min_stars:
        return {"key": key, "verdict": "below_threshold", "stars": stars}
    if current and current != key:
        return {"key": key, "verdict": "renamed", "current": current, "record": record}
    # resolves fine at this exact name, but search did not return it this run
    return {"key": key, "verdict": "live_unindexed", "record": record}


def main() -> int:
    ap = argparse.ArgumentParser(description="Reconcile stale catalog rows against the live API")
    ap.add_argument("--packed", default="web/public/catalog-packed.json")
    ap.add_argument("--harvest", default="/home/user/harvest/raw_repos.jsonl")
    ap.add_argument("--out", default="/home/user/harvest/reconcile.json")
    ap.add_argument("--min-stars", type=int, default=500)
    ap.add_argument("--concurrency", type=int, default=12)
    ap.add_argument("--limit", type=int, default=0, help="only inspect the first N unmatched rows")
    args = ap.parse_args()

    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if not token:
        print("Error: GITHUB_TOKEN or GH_TOKEN is required.", file=sys.stderr)
        return 1

    catalog = catalog_keys(args.packed)
    harvested = harvest_keys(args.harvest)
    unmatched = sorted(set(catalog) - harvested)
    print(f"catalog {len(catalog):,} rows | harvest {len(harvested):,} rows | unmatched {len(unmatched):,}")
    if args.limit:
        unmatched = unmatched[: args.limit]
        print(f"limiting reconciliation to {len(unmatched)} rows")

    t0 = time.time()
    verdicts = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        for i, res in enumerate(pool.map(lambda k: resolve(token, k, args.min_stars), unmatched), 1):
            verdicts.append(res)
            if i % 200 == 0:
                rate = i / max(1e-6, time.time() - t0)
                print(f"  {i}/{len(unmatched)} inspected ({rate:.1f}/s)", flush=True)

    tally: dict = {}
    drop, update = [], {}
    for res in verdicts:
        v = res["verdict"]
        tally[v] = tally.get(v, 0) + 1
        if v in ("deleted", "blocked", "below_threshold", "empty_repo"):
            drop.append(res["key"])
        elif v in ("renamed", "live_unindexed"):
            current = res.get("current")
            if current and current in harvested:
                # the harvest already carries this repo under its new name
                drop.append(res["key"])
                tally["renamed_duplicate_dropped"] = tally.get("renamed_duplicate_dropped", 0) + 1
            elif current and current in catalog and current != res["key"]:
                drop.append(res["key"])
                tally["renamed_already_in_catalog_dropped"] = tally.get("renamed_already_in_catalog_dropped", 0) + 1
            else:
                update[res["key"]] = {**res["record"], "current": current or res["key"]}

    print(f"\nverdicts: {json.dumps(tally, indent=2)}")
    payload = {"drop": drop, "update": update, "generated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "inspected": len(verdicts)}
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh)
    print(f"\nwrote {args.out}: {len(drop)} drops, {len(update)} row updates ({time.time()-t0:.0f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

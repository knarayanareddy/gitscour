"""Ship the 16 curated SEEDS cards into the Tier-2 shards (W2 §1.8).

`generate_seed.py` has carried hand-written ELI5 copy for 16 flagship repos
since the beginning, but nothing ever merged it into `web/public/data/details`
— the review found the curated cards were dead copy (finding #6b). This
script matches each seed by `owner/name` in the Tier-1 packed index, locates
its Tier-2 shard record by id, and replaces **only** `beginner_intel` and
`quickstart_code`.

Contract
--------
* default = dry-run: reports FOUND / IN-SYNC / would-update, writes nothing;
* `--apply` required to write (only rewrites shard files that changed);
* idempotent: a second run reports every seed IN-SYNC and writes nothing;
* `--require-all` exits 1 when any seed does not resolve (used by tests/CI);
* deterministic, zero LLM calls — same standing rule as the rest of W2.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Dict, List, Tuple

sys.path.append(os.path.dirname(__file__))
from generate_seed import SEEDS  # noqa: E402
from rebuild_catalog import slugify  # noqa: E402


def index_packed(packed_path: str) -> Dict[str, dict]:
    """{lowercase owner/name: {id, shard}} for every Tier-1 row."""
    with open(packed_path, "r", encoding="utf-8") as fh:
        packed = json.load(fh)
    domains = {int(k): v for k, v in (packed.get("domains") or {}).items()}
    index = {}
    for row in packed["rows"]:
        rid, name, owner = row[0], row[1], row[2]
        dom_name = domains.get(int(row[6]), "Other / General")
        index[f"{owner}/{name}".lower()] = {"id": rid, "shard": slugify(dom_name)}
    return index


def merge(base_dir: str, apply: bool, require_all: bool) -> int:
    packed_path = os.path.join(base_dir, "catalog-packed.json")
    details_dir = os.path.join(base_dir, "data", "details")
    if not os.path.exists(packed_path):
        print(f"FATAL: missing {packed_path}")
        return 2

    index = index_packed(packed_path)
    # shard -> already-loaded file, so each file is read and written at most once
    shard_cache: Dict[str, dict] = {}
    shard_path = lambda slug: os.path.join(details_dir, f"{slug}.json")  # noqa: E731

    def load_shard(slug: str) -> dict:
        if slug not in shard_cache:
            path = shard_path(slug)
            try:
                with open(path, "r", encoding="utf-8") as fh:
                    shard_cache[slug] = json.load(fh)
            except FileNotFoundError:
                shard_cache[slug] = {}
        return shard_cache[slug]

    dirty: set = set()
    missing: List[str] = []
    updated: List[str] = []
    in_sync: List[str] = []

    for seed in SEEDS:
        key = f"{seed['owner']}/{seed['name']}".lower()
        loc = index.get(key)
        if not loc:
            missing.append(f"{key} (not in packed index)")
            continue
        shard = load_shard(loc["shard"])
        rec = shard.get(str(loc["id"]))
        if not isinstance(rec, dict):
            missing.append(f"{key} (no Tier-2 record id={loc['id']} in {loc['shard']})")
            continue
        # sanity: the shard record must be the same project (guards re-keyed ids)
        rec_name = f"{rec.get('owner')}/{rec.get('name')}".lower()
        if rec_name != key:
            missing.append(f"{key} (shard record id={loc['id']} is {rec_name})")
            continue

        new_card = seed.get("beginner_intel") or {}
        new_quickstart = seed.get("quickstart_code") or ""
        if rec.get("beginner_intel") == new_card and rec.get("quickstart_code") == new_quickstart:
            in_sync.append(key)
            continue

        updated.append(key)
        dirty.add(loc["shard"])
        print(f"  {'[apply]' if apply else '[would-update]'} {key} "
              f"-> beginner_intel + quickstart_code in {loc['shard']}.json")
        if apply:
            rec["beginner_intel"] = new_card
            rec["quickstart_code"] = new_quickstart

    if apply and dirty:
        for slug in sorted(dirty):
            path = shard_path(slug)
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(shard_cache[slug], fh, separators=(",", ":"))
            print(f"  wrote {path} ({os.path.getsize(path) / 1e6:.2f} MB)")

    print(f"\nseeds: {len(SEEDS)} total | in sync: {len(in_sync)} | "
          f"{'updated' if apply else 'would update'}: {len(updated)} | "
          f"missing: {len(missing)}")
    for m in missing:
        print(f"  MISSING: {m}")
    if missing and require_all:
        return 1
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Merge curated SEEDS cards into Tier-2 shards")
    ap.add_argument("--base-dir", default="web/public")
    ap.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    ap.add_argument("--require-all", action="store_true",
                    help="exit 1 if any seed does not resolve to a shard record")
    args = ap.parse_args()
    mode = "APPLY" if args.apply else "DRY RUN"
    print(f"merge_seed_intel ({mode}) — {args.base_dir}")
    return merge(args.base_dir, args.apply, args.require_all)


if __name__ == "__main__":
    sys.exit(main())

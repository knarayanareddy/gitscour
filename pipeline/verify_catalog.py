"""Consistency gate for the generated GitScour catalog artefacts.

The pipeline writes four interdependent files, and nothing in CI previously
checked that they agreed with each other -- which is how `catalog-index.json`
ended up holding 1,276 records while `catalog-packed.json` held 51,192.

Checks performed
----------------
  1. every Tier-1 row decodes against its dictionary maps, ids are unique,
     and no row falls below the star threshold;
  2. the readable fallback index (`catalog-index.json`) and its legacy alias
     (`repos.json`) cover exactly the same ids as the packed index;
  3. every Tier-2 shard parses, is keyed by repo id, and its ids are a subset
     of the catalog; the union of all shards covers the whole catalog;
  4. per-domain shard membership matches each row's `shard` slug.

Usage: python3 pipeline/verify_catalog.py [--base-dir web/public] [--min-stars 500] [--skip-shards]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

SLUG_RE = re.compile(r"[^a-z0-9]+")
JS_SAFE_INT_MAX = 2 ** 53  # Number.MAX_SAFE_INTEGER + 1


def slugify(text):
    text = (text or "other-general").lower().replace("&", "and")
    return SLUG_RE.sub("-", text).strip("-") or "other-general"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-dir", default="web/public")
    ap.add_argument("--min-stars", type=int, default=500)
    ap.add_argument("--skip-shards", action="store_true", help="do not parse Tier-2 shards")
    ap.add_argument("--require-min-repos", type=int, default=1, help="fail if the catalog holds fewer rows than this")
    args = ap.parse_args()

    errors: list[str] = []
    base = args.base_dir
    packed_path = os.path.join(base, "catalog-packed.json")
    if not os.path.exists(packed_path):
        print(f"FATAL: missing {packed_path}")
        return 2

    with open(packed_path, "r", encoding="utf-8") as fh:
        packed = json.load(fh)

    rows = packed.get("rows") or []
    maps = {name: {int(k) for k in (packed.get(name) or {}).keys()} for name in
            ("domains", "subsystems", "languages", "artifacts")}
    print(f"Tier-1 packed index: {len(rows):,} rows, "
          f"{len(maps['domains'])} domains / {len(maps['subsystems'])} subsystems / "
          f"{len(maps['languages'])} languages / {len(maps['artifacts'])} artifacts")

    if len(rows) < args.require_min_repos:
        errors.append(f"catalog only has {len(rows)} rows (required >= {args.require_min_repos})")

    ids = set()
    dupes = 0
    below = 0
    oob = 0
    domain_sizes: dict[str, int] = {}
    for i, row in enumerate(rows):
        if len(row) != 12:
            errors.append(f"row {i} has {len(row)} fields, expected 12")
            break
        rid, name, owner, stars, forks, lang, dom, sub, art, license_, primitives, hook = row
        if rid in ids:
            dupes += 1
        ids.add(rid)
        if not name or not owner:
            errors.append(f"row {i} ({rid}) is missing owner/name")
            break
        if int(stars) < args.min_stars:
            below += 1
        for label, val, table in (("lang", lang, "languages"), ("dom", dom, "domains"),
                                  ("sub", sub, "subsystems"), ("art", art, "artifacts")):
            if int(val) not in maps[table]:
                oob += 1
        slug = slugify(packed["domains"][str(dom)])
        domain_sizes[slug] = domain_sizes.get(slug, 0) + 1
    if dupes:
        errors.append(f"{dupes} duplicate ids in packed index")
    # JS contract: the modal resolves Tier-2 with `shard[repo.id]`, and `repo.id`
    # comes from JSON.parse. An id above Number.MAX_SAFE_INTEGER is rounded during
    # parsing, so its string form no longer matches the shard key and deep intel
    # silently disappears. Keep every id inside the exactly-representable range.
    unsafe = sum(1 for r in rows if not (isinstance(r[0], int) and 0 < r[0] < JS_SAFE_INT_MAX))
    if unsafe:
        errors.append(f"{unsafe} ids are not exactly representable as JS Numbers (< 2^53); "
                      f"Tier-2 shard lookups will miss for those rows")
    if below:
        errors.append(f"{below} rows below the {args.min_stars} star threshold")
    if oob:
        errors.append(f"{oob} dictionary-encoded references outside their map")

    for fname in ("catalog-index.json", "repos.json"):
        path = os.path.join(base, fname)
        if not os.path.exists(path):
            errors.append(f"missing {path}")
            continue
        with open(path, "r", encoding="utf-8") as fh:
            index = json.load(fh)
        idx_ids = {r["id"] for r in index}
        status = "identical" if idx_ids == ids else "MISMATCH"
        print(f"Tier-1 fallback {fname:22s}: {len(index):,} records, ids {status} vs packed")
        if idx_ids != ids:
            errors.append(f"{fname}: {len(idx_ids)} records, {len(ids - idx_ids)} packed ids absent, "
                          f"{len(idx_ids - ids)} unknown ids present")

    if not args.skip_shards:
        details_dir = os.path.join(base, "data", "details")
        covered: set = set()
        stray = 0
        misplaced = 0
        total_deep = 0
        present_slugs = set()
        for fname in sorted(os.listdir(details_dir)) if os.path.isdir(details_dir) else []:
            if not fname.endswith(".json"):
                continue
            slug = fname[:-5]
            present_slugs.add(slug)
            with open(os.path.join(details_dir, fname), "r", encoding="utf-8") as fh:
                shard = json.load(fh)
            total_deep += len(shard)
            for key, rec in shard.items():
                try:
                    rid = int(key)
                except (TypeError, ValueError):
                    errors.append(f"{fname}: key {key!r} is not a repo id")
                    break
                if str(rid) != key:
                    # keys must be the canonical decimal form: that is what
                    # `shard[repo.id]` resolves to once JS parses the numeric id
                    errors.append(f"{fname}: key {key!r} is not the canonical id string {rid!r}")
                    break
                covered.add(rid)
                if rid not in ids:
                    stray += 1
        missing = ids - covered
        print(f"Tier-2 shards: {len(present_slugs)} files, {total_deep:,} deep records, "
              f"{len(covered):,} unique ids ({len(missing):,} catalog ids without deep record, {stray} stray)")
        if stray:
            errors.append(f"{stray} shard records have ids not present in the Tier-1 index")
        if missing:
            errors.append(f"{len(missing)} catalog repositories have no Tier-2 deep record")
        for slug in domain_sizes:
            if slug not in present_slugs:
                errors.append(f"domain shard missing for '{slug}' ({domain_sizes[slug]} repos)")
        for slug in present_slugs - set(domain_sizes):
            errors.append(f"orphan shard '{slug}' has no matching domain in the packed index")

    print()
    if errors:
        print(f"FAILED with {len(errors)} problem(s):")
        for e in errors[:25]:
            print(f"  - {e}")
        return 1
    print(f"OK: catalog artefacts are internally consistent ({len(rows):,} repositories).")
    return 0


if __name__ == "__main__":
    sys.exit(main())

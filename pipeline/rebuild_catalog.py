"""Merge a raw harvest into the GitScour catalog and regenerate every artefact.

This is the consolidation stage that the existing scripts lack: `harvest_scale.py`
and `backfill_worker.py` write shards directly, and `pack_index.py` rebuilds the
packed index from `catalog-index.json`.  That coupling is why the checked-in
`catalog-index.json` (1,276 records) had silently drifted out of sync with
`catalog-packed.json` (51,192 records).

Here the *union* of the live catalog and the new harvest is the single source of
truth, and all four artefacts are written from it in one pass:

  * `web/public/catalog-packed.json`        Tier 1, dictionary-encoded rows (primary)
  * `web/public/catalog-index.json`         Tier 1, readable fallback list
  * `web/public/repos.json`                 legacy alias of the above
  * `web/public/data/details/<domain>.json` Tier 2 deep-intel shards keyed by repo id

Identity rules
--------------
Existing records are keyed by `owner/name` (case-insensitive), *not* by `id`:
rows ingested from the third-party CSV snapshots carry `abs(hash(url))` ids, and
Python's string hash is salted per process, so ids are not reproducible across
runs.  A harvested repo that already exists keeps its original id (so deep links
stay valid) while its volatile counters (stars / forks / pushed_at) are refreshed
and its maturity tier recomputed.  Genuinely new repos are classified through the
deterministic `taxonomy_engine`.

Since W2 (§1.3) the pipeline stages below are importable single-writer units so
`reclassify_catalog.py` can re-score rows and rewrite artefacts through exactly
the same code path:

  * `attach_deep(catalog, deep)`  — fold Tier-2 deep intel back onto Tier-1 records
  * `finalize_records(catalog, ...)` — filter, re-key ids, recompute derived fields
  * `write_artifacts(records, ...)`  — the three writers (shards / fallback / packed)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict

sys.path.append(os.path.dirname(__file__))
from facets import write_facets  # noqa: E402
from neighbors import write_edges  # noqa: E402
from search_index import write_search_index  # noqa: E402
from taxonomy_engine import (  # noqa: E402
    classify_maturity,
    enrich_repository_record,
    generate_beginner_context,
)

SLUG_RE = re.compile(r"[^a-z0-9]+")
# Largest integer JavaScript's Number type represents exactly; ids must stay below it.
JS_SAFE_INT_MAX = 2 ** 53
# Re-keyed ids live in [2^40, 2^41): above real GitHub databaseIds (which pass 10^10
# only around 2050) and far below the precision limit, so they are stable and exact.
SYNTHETIC_ID_BASE = 2 ** 40
SYNTHETIC_ID_SPAN = 2 ** 40
MAX_KEYWORDS = 8
MAX_COMPAT = 4
# W2 §1.4: topics travel with Tier-1 rows going forward (topics[:8] in shards and
# re-attached fill-if-empty), so reclassification never depends on a live API call.
MAX_TOPICS = 8
# Deep fields re-attached from Tier-2 shards. `topics` is fill-if-empty: a fresher
# topics list from the harvest merge must win over the stored shard copy.
DEEP_FIELDS = ("beginner_intel", "license_intel", "quickstart_code", "usecases",
               "compatibility", "maturity", "keywords")


def slugify(text):
    text = (text or "other-general").lower().replace("&", "and")
    return SLUG_RE.sub("-", text).strip("-") or "other-general"


def normalise_topics(topics):
    """Repair topics that arrived as a stringified JSON array from CSV snapshots."""
    if not topics:
        return []
    if isinstance(topics, str):
        topics = [topics]
    out = []
    for item in topics:
        if isinstance(item, str):
            s = item.strip()
            if s.startswith("[") and s.endswith("]"):
                try:
                    parsed = json.loads(s)
                except Exception:
                    parsed = None
                if isinstance(parsed, list):
                    out.extend(str(p) for p in parsed if p)
                    continue
            if s:
                out.append(s)
        elif item:
            out.append(str(item))
    seen, deduped = set(), []
    for t in out:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(t)
    return deduped


def load_packed(path: str) -> dict:
    """Existing Tier-1 rows -> {full_name_lower: record}.

    Row arity is 12 (pre-W2) or 13 (W2+): the optional 13th field is the
    taxonomy confidence `domain_margin` (0..9).
    """
    with open(path, "r", encoding="utf-8") as fh:
        packed = json.load(fh)
    domains = {int(k): v for k, v in packed["domains"].items()}
    subsystems = {int(k): v for k, v in packed["subsystems"].items()}
    languages = {int(k): v for k, v in packed["languages"].items()}
    artifacts = {int(k): v for k, v in packed["artifacts"].items()}

    records = {}
    for row in packed["rows"]:
        head = row[:12]
        repo_id, name, owner, stars, forks, lang_id, dom_id, sub_id, art_id, license_, primitives, hook = head
        margin = row[12] if len(row) > 12 else 0
        topics_row = row[13] if len(row) > 13 and isinstance(row[13], list) else []
        compat_row = row[14] if len(row) > 14 and isinstance(row[14], list) else []
        key = f"{owner}/{name}".lower()
        records[key] = {
            "id": repo_id,
            "name": name,
            "owner": owner,
            "stars": stars,
            "forks": forks,
            "language": languages.get(lang_id, "Other"),
            "domain": domains.get(dom_id, "Other / General"),
            "subsystem": subsystems.get(sub_id, "General Components"),
            "artifact": artifacts.get(art_id, "Application / Service"),
            "domain_margin": margin,
            "license": license_ or "Open Source",
            "primitives": primitives or [],
            "hook": hook or "",
            "description": hook or "",
            "topics": topics_row,
            "compatibility": compat_row,
            "keywords": [],
            "beginner_intel": {},
            "license_intel": {},
            "maturity": {},
            "quickstart_code": "",
            "pushed_at": None,
            "usecases": [],
            "_source": "catalog",
        }
    return records


def load_shards(details_dir: str) -> dict:
    """Tier-2 deep records -> {repo_id: deep_fields}."""
    deep = {}
    if not os.path.isdir(details_dir):
        return deep
    for fname in sorted(os.listdir(details_dir)):
        if not fname.endswith(".json"):
            continue
        with open(os.path.join(details_dir, fname), "r", encoding="utf-8") as fh:
            for repo_id, rec in json.load(fh).items():
                try:
                    rid = int(repo_id)
                except (TypeError, ValueError):
                    rid = repo_id
                if isinstance(rec, dict):
                    deep[rid] = rec
    return deep


def iter_harvest_records(path: str):
    """Yield raw repo dicts from either a JSONL checkpoint or a single JSON array."""
    with open(path, "r", encoding="utf-8") as fh:
        head = fh.read(4096).lstrip()
        fh.seek(0)
        if head.startswith("["):
            for rec in json.load(fh):
                yield rec
            return
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                yield None


def merge_harvest(catalog: dict, harvested_path: str, stats: Counter) -> None:
    for raw in iter_harvest_records(harvested_path):
        if raw is None:
            stats["bad_lines"] += 1
            continue
        try:
            owner, name = raw.get("owner"), raw.get("name")
        except AttributeError:
            stats["bad_lines"] += 1
            continue
        if not owner or not name:
            stats["incomplete"] += 1
            continue
        stars = int(raw.get("stars") or 0)
        if stars < 500:
            stats["below_threshold"] += 1
            continue
        key = f"{owner}/{name}".lower()
        existing = catalog.get(key)
        if existing is not None:
            stats["refreshed"] += 1
            existing["stars"] = stars
            existing["forks"] = int(raw.get("forks") or 0)
            existing["pushed_at"] = raw.get("pushed_at") or existing.get("pushed_at")
            new_desc = (raw.get("description") or "").strip()
            if new_desc:
                existing["description"] = new_desc
                existing["hook"] = existing.get("hook") or new_desc[:90]
            topics = normalise_topics(raw.get("topics"))
            if topics:
                existing["topics"] = topics
            if raw.get("language"):
                existing["language"] = raw["language"]
            if raw.get("license") and existing.get("license") in (None, "", "Unknown"):
                existing["license"] = raw["license"]
            continue
        enriched = enrich_repository_record(raw)
        enriched["topics"] = normalise_topics(raw.get("topics"))
        enriched["keywords"] = normalise_topics(enriched.get("keywords"))
        enriched["_source"] = "harvest"
        catalog[key] = enriched
        stats["new"] += 1


def apply_reconcile(catalog: dict, patch: dict, stats: Counter) -> None:
    """Apply a reconcile_stale_rows.py patch: drop unresolvable, repoint renames."""
    dropped = 0
    for key in patch.get("drop") or []:
        if catalog.pop(key, None) is not None:
            dropped += 1
    updated = collisions = 0
    for key, upd in (patch.get("update") or {}).items():
        rec = catalog.get(key)
        if rec is None:
            continue
        new_key = f"{upd.get('owner')}/{upd.get('name')}".lower()
        if new_key != key and new_key in catalog:
            catalog.pop(key)
            collisions += 1
            continue
        raw = {k: upd.get(k) for k in ("id", "name", "owner", "description", "stars",
                                       "forks", "language", "license", "topics", "pushed_at")}
        enriched = enrich_repository_record(raw)
        # keep the original id so Tier-2 shard keys and existing deep links stay valid
        enriched["id"] = rec["id"]
        enriched["topics"] = normalise_topics(raw.get("topics"))
        enriched["keywords"] = normalise_topics(enriched.get("keywords"))
        enriched["_source"] = "reconciled"
        catalog.pop(key)
        catalog[new_key] = enriched
        updated += 1
    stats["reconcile_dropped"] = dropped
    stats["reconcile_updated"] = updated
    print(f"Reconciled: dropped {dropped} unresolvable rows, repointed {updated} renamed, "
          f"skipped {collisions} collisions")


def attach_deep(catalog: dict, deep: dict) -> int:
    """Re-key by id, fold Tier-2 deep intel onto the records, return attach count.

    `topics` fills only when empty so fresher harvest topics win (§1.4).
    """
    by_id = {r["id"]: r for r in catalog.values()}
    id_counts = Counter(r["id"] for r in catalog.values())
    colliding = sum(c for c in id_counts.values() if c > 1)
    if colliding:
        print(f"  note: {colliding} records share an id; last writer wins in Tier-2 shard keys")

    attached = 0
    for rid, rec in by_id.items():
        shard_rec = deep.get(rid)
        if not shard_rec:
            continue
        attached += 1
        for field in DEEP_FIELDS:
            value = shard_rec.get(field)
            if value:
                rec[field] = value
        stored_topics = normalise_topics(shard_rec.get("topics"))
        if stored_topics and not rec.get("topics"):
            rec["topics"] = stored_topics[:MAX_TOPICS]
        rec["keywords"] = normalise_topics(rec.get("keywords"))
        # a shard description beats the truncated Tier-1 hook, but never for a row
        # we just repointed from the live API -- that description is the fresher one
        if shard_rec.get("description") and rec.get("_source") != "reconciled":
            rec["description"] = shard_rec["description"]
            rec["hook"] = (rec.get("hook") or rec["description"])[:90]
        if shard_rec.get("pushed_at"):
            rec["pushed_at"] = rec.get("pushed_at") or shard_rec["pushed_at"]
    return attached


def finalize_records(catalog: dict, min_stars: int, stats: Counter) -> list:
    """Filter by stars, sort, re-key unsafe ids, recompute derived row fields."""
    records = sorted(
        (r for r in catalog.values() if int(r.get("stars") or 0) >= min_stars),
        key=lambda x: (-int(x["stars"]), str(x.get("full_name") or f"{x['owner']}/{x['name']}")),
    )

    # Row ids must survive a JavaScript JSON.parse. Rows inherited from the
    # third-party CSV snapshots carry `abs(hash(url))` ids: 19-digit integers that
    # exceed Number.MAX_SAFE_INTEGER, so the browser rounds them and the modal's
    # `shard[repo.id]` lookup silently misses -- 92.5% of the previous catalog
    # therefore rendered generic placeholder copy instead of its deep intel.
    # Re-key those rows deterministically into a band above real GitHub id space
    # (2^40) but below 2^53, so ids stay stable across runs and stay exact in JS.
    taken = {r["id"] for r in records
             if isinstance(r.get("id"), int) and 0 < r["id"] < JS_SAFE_INT_MAX}
    claimed: set = set()
    rekeyed = 0
    for r in records:
        rid = r.get("id")
        if isinstance(rid, int) and 0 < rid < JS_SAFE_INT_MAX and rid not in claimed:
            claimed.add(rid)  # unique and exactly representable: keep it as-is
            continue
        digest = hashlib.blake2b(
            f"{r['owner']}/{r['name']}".lower().encode("utf-8"), digest_size=8).digest()
        candidate = SYNTHETIC_ID_BASE + (int.from_bytes(digest, "big") % SYNTHETIC_ID_SPAN)
        while candidate in taken or candidate in claimed:
            candidate += 1
        claimed.add(candidate)
        taken.add(candidate)
        r["id"] = candidate
        rekeyed += 1
    if rekeyed:
        print(f"Re-keyed {rekeyed} rows with out-of-range ids so Tier-2 lookups resolve in JS")

    stats["final"] = len(records)

    # maturity is star-driven, so recompute it for every row (cheap + deterministic)
    for r in records:
        r["maturity"] = classify_maturity(int(r["stars"]), int(r.get("forks") or 0), r.get("pushed_at"))
        r.setdefault("full_name", f"{r['owner']}/{r['name']}")
        r["shard"] = slugify(r.get("domain"))
        # ~3% of GitHub repositories have no description at all (e.g. deepseek-ai/
        # DeepSeek-V3). Without a hook those rows render as blank cards, so fall
        # back to the same deterministic context sentence the taxonomy engine
        # already puts in beginner_intel -- no invented prose, just a different
        # surface for the classification we did compute.
        if not (r.get("hook") or "").strip() and not (r.get("description") or "").strip():
            r["hook"] = generate_beginner_context(
                r["name"], r.get("domain") or "General",
                r.get("subsystem") or "General Components",
                r.get("language") or "Other")["what_it_does"]
            stats["hook_synthesized"] += 1
    return records


def default_beginner_intel(hook: str, subsystem) -> dict:
    """Deterministic fallback card written when a record has no beginner_intel.

    Kept as one function so `reclassify_catalog.py` can recognise (and
    re-render) these cards exactly the way the writer produced them.
    """
    return {
        "what_it_does": hook,
        "why_it_matters": "A notable open source project with significant community adoption.",
        "when_to_use": f"Use when building systems that require high performance in {subsystem or 'its domain'}.",
        "alternatives": ["Standard library solutions", "Cloud managed services"],
        "key_superpowers": ["High performance", "Active community", "Open architecture"],
    }


def write_artifacts(records: list, base_dir: str, write_shards: bool = True) -> dict:
    """Write Tier-2 shards, Tier-1 fallback index, and the packed index.

    `write_shards=False` regenerates only the Tier-1 artifacts (packed rows,
    search index, edges, facets) — used for local W3 regenerations where the
    Tier-2 shard bytes must stay byte-identical to the committed backfill
    output (CI owns those files).
    """
    details_dir = os.path.join(base_dir, "data", "details")

    # ---------------- Tier 2: deep detail shards ----------------
    # Tier 2 carries only what Tier 1 cannot: the deep intelligence sheet. Mirroring
    # scalars here is what pushed shards to ~1.7 kB/record, and because the modal
    # spreads `...deepRecord` over the Tier-1 row, a stale mirror silently wins.
    shards = defaultdict(dict)
    for r in records:
        slug = r["shard"]
        hook = (r.get("hook") or r.get("description") or "")[:90]
        shards[slug][r["id"]] = {
            "id": r["id"],
            "name": r["name"],
            "owner": r["owner"],
            "description": r.get("description") or "",
            "primitives": (r.get("primitives") or [])[:6],
            "compatibility": (r.get("compatibility") or [])[:MAX_COMPAT],
            "keywords": (r.get("keywords") or [])[:MAX_KEYWORDS],
            # W2 §1.4: store topics going forward so reclassification round-trips.
            "topics": (r.get("topics") or [])[:MAX_TOPICS],
            "beginner_intel": r.get("beginner_intel") or default_beginner_intel(hook, r.get("subsystem")),
            "license_intel": r.get("license_intel") or {
                "tier": "Permissive",
                "commercial": "Commercially Permissive",
                "desc": "Permissive open source terms.",
            },
            "maturity": r.get("maturity") or {"rating": "Community Popular (>500★)", "level": "tier-3"},
            "quickstart_code": r.get("quickstart_code") or f"git clone https://github.com/{r['owner']}/{r['name']}.git",
            # the modal's "Pushed:" line reads this off the merged deep record, and
            # Tier-1 (packed rows) does not carry it -- it must stay here.
            "pushed_at": r.get("pushed_at") or "2026-09-01T00:00:00Z",
        }

    os.makedirs(details_dir, exist_ok=True)
    shard_bytes = 0
    if not write_shards:
        print(f"  [skip] Tier-2 shard rewrite (local regen; {len(shards)} shards untouched)")
    for slug, recs in sorted(shards.items(), key=lambda kv: -len(kv[1])):
        if not write_shards:
            continue
        path = os.path.join(details_dir, f"{slug}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(recs, fh, separators=(",", ":"))
        size = os.path.getsize(path)
        shard_bytes += size
        print(f"  shard [{slug:38s}] {len(recs):7d} deep records  {size/1e6:6.2f} MB")

    # ---------------- Tier 1: readable fallback index ----------------
    # Readable fallback for the loader path that only runs if the packed index
    # fails to fetch, plus the input `pack_index.py` expects. Dropped from 18 to
    # 16 keys: `full_name` is derivable from owner+name and `pushed_at` lives in
    # Tier 2, which together save ~18 MB per copy at this catalog size.
    tier1 = []
    for r in records:
        hook = (r.get("hook") or r.get("description") or "")[:90]
        tier1.append({
            "id": r["id"],
            "name": r["name"],
            "owner": r["owner"],
            "stars": r["stars"],
            "forks": r.get("forks", 0),
            "language": r.get("language") or "Other",
            "license": r.get("license") or "Unknown",
            "artifact": r.get("artifact") or "Application / Service",
            "domain": r.get("domain") or "Other / General",
            "subsystem": r.get("subsystem") or "General Components",
            "primitives": (r.get("primitives") or [])[:6],
            "compatibility": (r.get("compatibility") or [])[:MAX_COMPAT],
            "hook": hook,
            "description": (r.get("description") or hook)[:90],
            "url": r.get("url") or f"https://github.com/{r['owner']}/{r['name']}",
            "shard": r["shard"],
        })
    for name in ("catalog-index.json", "repos.json"):
        path = os.path.join(base_dir, name)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(tier1, fh, separators=(",", ":"))
        print(f"Tier 1 fallback: {path} ({len(tier1)} repos, {os.path.getsize(path)/1e6:.2f} MB)")

    # ---------------- Tier 1: dictionary-encoded packed index ----------------
    domain_map, subsystem_map, lang_map, artifact_map = {}, {}, {}, {}

    def intern(mapping, val):
        val = val or "Other"
        if val not in mapping:
            mapping[val] = len(mapping)
        return mapping[val]

    rows = []
    for r in records:
        rows.append([
            r["id"],
            r["name"],
            r["owner"],
            r["stars"],
            r.get("forks", 0),
            intern(lang_map, r.get("language")),
            intern(domain_map, r.get("domain")),
            intern(subsystem_map, r.get("subsystem")),
            intern(artifact_map, r.get("artifact")),
            r.get("license") or "Open Source",
            (r.get("primitives") or [])[:6],
            (r.get("hook") or r.get("description") or "")[:90],
            # W2 §1.1: confidence margin, schema becomes 12-or-13 fields
            int(r.get("domain_margin") or 0),
            # W3 §2.2/2.4: search + similarity evidence. Omitted when both are
            # empty so rows without evidence keep the compact 13-field shape
            # (legacy 12/13 and full 15-field rows both parse everywhere).
            *(([ (r.get("topics") or [])[:8], (r.get("compatibility") or [])[:MAX_COMPAT] ]
               if (r.get("topics") or r.get("compatibility")) else [])),
        ])
    payload = {
        "domains": {v: k for k, v in domain_map.items()},
        "subsystems": {v: k for k, v in subsystem_map.items()},
        "languages": {v: k for k, v in lang_map.items()},
        "artifacts": {v: k for k, v in artifact_map.items()},
        "rows": rows,
    }
    packed_out = os.path.join(base_dir, "catalog-packed.json")
    with open(packed_out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, separators=(",", ":"))
    print(f"Packed index:  {packed_out} ({len(rows)} repos, {os.path.getsize(packed_out)/1e6:.2f} MB)")

    # W3 §2.1: ranked-search index (ordinals == rows[] positions)
    search_bytes = write_search_index(records, base_dir)
    # W3 §2.4: kNN edge list for the graph + "Similar repositories" tab
    edges_stats = write_edges(records, base_dir)
    # W3 §2.8: exact facet counts for filter chips
    facets_bytes = write_facets(records, base_dir)

    return {"shard_bytes": shard_bytes, "packed_bytes": os.path.getsize(packed_out),
            "search_index_bytes": search_bytes, "edges": edges_stats,
            "facets_bytes": facets_bytes}


def print_domain_histogram(records: list) -> None:
    for domain, n in Counter(r["domain"] for r in records).most_common():
        print(f"  {domain:40s} {n:7d}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Consolidate harvest into the GitScour catalog")
    parser.add_argument("--base-dir", default="web/public")
    parser.add_argument("--harvest", default="/home/user/harvest/raw_repos.jsonl")
    parser.add_argument("--stats-out", default="", help="defaults to <harvest dir>/rebuild_stats.json")
    parser.add_argument("--reconcile", default="", help="patch file from reconcile_stale_rows.py")
    parser.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    parser.add_argument("--min-stars", type=int, default=500)
    args = parser.parse_args()
    stats_out = args.stats_out or os.path.join(os.path.dirname(os.path.abspath(args.harvest)) or ".", "rebuild_stats.json")

    stats: Counter = Counter()
    packed_path = os.path.join(args.base_dir, "catalog-packed.json")
    details_dir = os.path.join(args.base_dir, "data", "details")

    print(f"Loading existing Tier-1 packed index: {packed_path}")
    catalog = load_packed(packed_path)
    stats["existing"] = len(catalog)
    print(f"  {len(catalog)} records")

    print("Loading existing Tier-2 deep shards")
    deep = load_shards(details_dir)
    print(f"  {len(deep)} deep records")

    print(f"Merging harvest: {args.harvest}")
    merge_harvest(catalog, args.harvest, stats)
    print(f"  {dict(stats)}")

    if args.reconcile:
        with open(args.reconcile, "r", encoding="utf-8") as fh:
            patch = json.load(fh)
        apply_reconcile(catalog, patch, stats)

    attached = attach_deep(catalog, deep)
    print(f"  re-attached deep intel to {attached} records")

    records = finalize_records(catalog, args.min_stars, stats)
    dropped = stats["existing"] + stats["new"] + stats["refreshed"] - len(records)
    print(f"Final catalog: {len(records)} unique repositories (>= {args.min_stars} stars)")

    if args.dry_run:
        print("\n[dry run] domain distribution:")
        print_domain_histogram(records)  # rows only, header printed above
        print(f"[dry run] new records: {stats['new']}, refreshed: {stats['refreshed']}")
        return 0

    sizes = write_artifacts(records, args.base_dir)

    total = sizes["shard_bytes"] + sizes["packed_bytes"] + 2 * os.path.getsize(os.path.join(args.base_dir, "repos.json"))
    print("\n=== SUMMARY ===")
    print(f"repositories       : {len(records):,}  (was {stats['existing']:,})")
    print(f"new / refreshed    : {stats['new']:,} / {stats['refreshed']:,}")
    print(f"tier-1 packed      : {sizes['packed_bytes']/1e6:.2f} MB")
    print(f"tier-2 shards      : {sizes['shard_bytes']/1e6:.2f} MB")
    print(f"web/public total   : {total/1e6:.2f} MB (approx)")
    with open(stats_out, "w", encoding="utf-8") as fh:
        json.dump({"stats": dict(stats), "domains": dict(Counter(r["domain"] for r in records))}, fh, indent=2)
    print(f"stats written to {stats_out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

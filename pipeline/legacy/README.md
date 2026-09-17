# Pipeline Legacy Archive

This directory archives superseded data acquisition, indexing, and sharding scripts from earlier development iterations of GitScour.

## Why These Scripts Were Superseded

1. **GitHub Search 1,000-Node Query Ceiling:**
   * `backfill_worker.py`, `fast_harvest.py`, `harvest_20k.py`, `harvest_phase1.py`, and `harvest_scale.py` paginated across fixed star bands. Because GitHub enforces a hard 1,000-result cap per search query, these samplers could never exceed ~1,000 repos per window.
   * **Replacement:** `pipeline/harvest_enumerate.py` bisects the star and fork continuum dynamically to guarantee every query window falls $\le 1,000$, capturing the full 123,000+ universe.

2. **Index / Shard Drift & Non-Deterministic IDs:**
   * `scale_50k.py` assigned IDs using `abs(hash(url))`. Because Python's string hashing is salted per process, IDs changed every run and generated 19-digit integers $> 2^{53} - 1$ (`Number.MAX_SAFE_INTEGER`). When loaded in JavaScript, these IDs rounded, breaking Tier-2 shard lookups.
   * `pack_index.py` and `shard_manager.py` rebuilt only subsets of the dataset, causing Tier-1 and Tier-2 to drift out of sync.
   * **Replacement:** `pipeline/rebuild_catalog.py` is the single consolidation point that generates both Tier-1 indexes (`catalog-packed.json`, `catalog-index.json`) and Tier-2 deep shards in a single pass with deterministic Blake2b JS-safe integers in the $[2^{40}, 2^{41})$ range.

3. **Curated Seed Ingestion:**
   * `generate_seed.py` and `ingest.py` provided early static mock datasets and basic GraphQL scripts, now superseded by automated universe enumeration.

## Active Pipeline Scripts

For live operations, use only:
* `pipeline/harvest_enumerate.py` — Window-partitioned GraphQL sweep.
* `pipeline/rebuild_catalog.py` — Single source of truth generator for Tier-1 & Tier-2 artifacts.
* `pipeline/verify_catalog.py` — Integrity and consistency gate.
* `pipeline/reconcile_stale_rows.py` — Stale repository cleaner and rename resolver.
* `pipeline/taxonomy_engine.py` — 4D classification and primitives engine.

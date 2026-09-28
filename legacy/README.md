# Legacy scripts (frozen reference code)

These nine files were the harvest-era pipeline. They are **reference-only**:
nothing in the runbook, the test suite, or either CI workflow imports or runs
them. They moved out of `pipeline/` (W5 O.6) so `pipeline/` contains only live
code, and they are kept — not deleted — to preserve the design history and the
salted-hash footgun documentation below. Do not run them against the live
catalog.

| File | What it did | Why it is frozen |
| --- | --- | --- |
| `ingest.py` | Original GraphQL fetch: one search query per run, wrote the raw harvest the catalog was built from | GitHub truncates *any* search query at 1,000 results, so a single-query fetch can never cover the universe; superseded by `pipeline/harvest_enumerate.py`'s window-partitioned sweep |
| `harvest_scale.py` | Early sampler driving the GraphQL *search* API over a fixed list of coarse star windows (2 pages of 40 ≈ 960 records per window) | Same 1,000-result ceiling; also the script that used to rebuild the index + shards on every deploy from a stale subset (see the note in `.github/workflows/deploy.yml`) |
| `backfill_worker.py` | Per-window harvest worker that wrote Tier-2 domain shards directly, bypassing a consolidation step | Direct shard writes are how `catalog-index.json` and `catalog-packed.json` drifted apart; `pipeline/rebuild_catalog.py` is now the single consolidation point |
| `fast_harvest.py` | Threaded variant of the same search-API sampler | Same truncation ceiling as the other samplers |
| `harvest_20k.py` | One-off 20k-record harvest campaign (pulled language lists from a third-party dataset via `gh api`) | Campaign script, superseded by the enumerator sweep |
| `harvest_phase1.py` | One-off phase-1 harvest (30-item pages over coarse windows) | Campaign script, superseded by the enumerator sweep |
| `scale_50k.py` | One-off 50k-record scaling run; merged a canonical CSV registry with harvested rows | **Salted-hash footgun — kept, not deleted:** it re-derives record ids with `abs(hash(url))` (see lines 29, 84, 107, 130, 155). Python salts string hashing per process, so re-running it rewrites *every* id in the catalog and breaks all Tier-2 lookups. `pipeline/rebuild_catalog.py` assigns stable ids inside JavaScript's exact-integer range instead. The same warning is quoted in the main README's artefact table |
| `pack_index.py` | Rebuilt only `catalog-index.json` (dictionary-encoded compact rows) | Superseded artefact writer: it rewrote just *part* of the artefact set, which is how the index and shards drifted; `pipeline/rebuild_catalog.py` writes all three from one source of truth |
| `shard_manager.py` | `build_sharded_dataset()` helper: split the dataset into the Tier-1 index + Tier-2 `data/details/*.json` shards | Only the frozen samplers import it; the live pipeline writes shards via `pipeline/rebuild_catalog.py` |

Notes for readers of this archive:

- The samplers import `taxonomy_engine` from the live `pipeline/` tree; that
  import is historical and unmaintained — run nothing here.
- The output shape documented in `harvest_enumerate.py` ("shaped exactly like
  the raw dict inside `backfill_worker.py`") is why this archive still matters:
  it is the contract the live sweep preserved.

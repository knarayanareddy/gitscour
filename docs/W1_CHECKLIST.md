# W1 — Stop the bleeding: implementation checklist

Source: `docs/EXPERT_PANEL_REVIEW.md` §4, Wave W1. Branch `arena/01a0d2cb-gitscour`.

Hard constraint throughout: **zero LLM calls** — every fix is deterministic code.

**Status: COMPLETE (2026-09-24).** All items and verification gates below passed.
What remains is tracked in `docs/REMAINING_WORK.md`.

## W1 items

- [x] **W1.1 Stack-Architect crash** (`web/src/InspirationGenerator.jsx`)
  - [x] Drop stale hardcoded `repoId: 44211562` (duckdb's real GitHub id; not in catalog) — Layer 0 now starts `null`
  - [x] `.filter(item => item.repo !== null)` keeps `undefined` → truthy check (line ~175)
  - [x] Replace side-effectful `useMemo` seed with a proper effect that also self-heals stale ids via `repoMap.has()`
  - [x] Normalize `repoMap.get()` lookups (`(slot.repoId && repoMap.get(...)) || null`)
- [x] **W1.2 Harvest completeness** (`pipeline/harvest_enumerate.py`)
  - [x] `raise` on mid-pagination `RuntimeError` — partial window can never be checkpointed (#2a)
  - [x] Raise when window still has pages after the 10-page cap ("outgrew the search cap") (#2c)
  - [x] `probe_count` returns `None` on failure (never `0`); planner retries 3× then aborts — never skips a star range (#2b)
  - [x] `window_clause`: open-ended fork axis emits `forks:>=N` (was exact `forks:N`) (#2d)
  - [x] Non-zero exit: `2` if any window failed, `3` if truncated (`--allow-truncated` escape hatch); `stats.json` now records `windows_failed`; planner aborts cleanly with exit `1`
- [x] **W1.3 Graph3D wiring** (`web/src/Graph3DExplorer.jsx`, new `web/src/compatibility.js`)
  - [x] Prop-sync effect `selectedDomain → filterDomain` — App-level dropdown no longer inert (#7a)
  - [x] Populated `repo.compatibility` for graph nodes via `web/src/compatibility.js` — direct port of `COMPATIBILITY_RULES` (same labels/order/regexes/first-4 cap); "Shared Interop" edges can now fire (#7b)
  - [x] `setFilterMinStars` wired to a 4-preset control (500/1k/5k/25k) in the settings palette (#7a)
- [x] **W1.4 Smoke test in CI** (`.github/workflows/deploy.yml`)
  - [x] `npm run smoke` runs after `npm run build`, before Setup Pages
- [x] **W1.5 Quick-start footgun** (`pipeline/generate_seed.py`, `README.md`, `.gitignore`)
  - [x] Default output moved to `pipeline/seed_demo.json` (gitignored) — never `web/public/repos.json` (#6)
  - [x] `--output` guard refuses any path inside `web/public/` (verified: relative + absolute both rejected)
  - [x] README step 2 documents the demo output and the clobber history

## Verification gates (all passed)

- [x] `python3 pipeline/verify_catalog.py` — **OK: 123,153 repositories consistent** (artifacts untouched)
- [x] Harvest unit probes (7/7): `forks:>=1001` emitted; probe→`None`; planner abort after 3 failed probes; legit empty ranges still skipped; mid-pagination failure raises; page-cap overflow raises; clean window returns records
- [x] `npm run build` — succeeds (vite, 1,570 modules)
- [x] `npm run smoke` — **OK: packed decode, Tier-2 lazy merge, fallback index consistent for 123,153 repos**
- [x] `generate_seed.py` writes 16 records to `pipeline/seed_demo.json`; live `repos.json` byte/size untouched; both `web/public` targets rejected
- [x] `deriveCompatibility` probe: redis→`Redis Compatible`, kubernetes→`Kubernetes Native` (**matches Tier-2 authoritative value**), minio→`S3 API Compatible`, empty corpus→`[]`
- [x] Workflow YAML parses (deploy + backfill); greps confirm no stale `44211562` id, no `!== null` filters, no direct state mutation, both previously-dead setters now called

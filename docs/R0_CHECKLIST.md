# §0 — Three small cuts after W1: implementation checklist

Source: `docs/REMAINING_WORK.md` §0 (deliberate W1 scope cuts). Branch `arena/01a0d2cb-gitscour`.
W1 status: see `docs/W1_CHECKLIST.md`. Standing rule: **zero LLM calls.**

**Status: COMPLETE (2026-09-24).** All items and verification gates passed.

## Items

- [x] **R0.1 — Honest graph node counts** (review finding #7c)
  - [x] `Graph3DExplorer.jsx` exports `GRAPH_SAMPLE_LIMIT = 1600` / `GRAPH_LINK_LIMIT = 450`
        (previously hardcoded literals at the two use sites)
  - [x] Graph reports live stats up via `onStatsChange` callback
        (`{rendered, linked, filtered}` — filtered = post domain/min-stars rows,
        rendered = sample actually built, linked = link-synthesis cohort)
  - [x] `App.jsx` header now reads
        `123,153 catalog · 1,600 rendered · top 450 linked` (no more bare
        "123,153 Nodes" claim), with a tooltip explaining the star-ranked sample;
        stats segment hidden until the first report arrives (no `0 rendered` flash)
- [x] **R0.2 — Smoke test in the backfill workflow** (review finding #14)
  - [x] `backfill_123k.yml`: pinned Node 20 + `node web/smoke-test.mjs web/public`
        after `verify_catalog.py`, before the checkpoint-upload and PR steps —
        a PR now can't open with artefacts that break the decode contract
- [x] **R0.3 — Harvest probes promoted to a real test file**
  - [x] New `tests/test_harvest_enumerate.py` — `unittest.TestCase` design so it
        runs dependency-free (`python3 -m unittest`) and under pytest (CI)
  - [x] Coverage: `window_clause` (open-ended `forks:>=N`, exact, range, no-fork,
        star-range), `probe_count` (`None` on `RuntimeError`, `None` after
        `Backoff` exhaustion, happy path), planner (abort after 3 failed probes,
        legit-empty skip, gap-free split arithmetic, fork-axis split emitting
        `forks:>=1001`), `harvest_window` (mid-pagination raise, page-cap raise,
        clean window, Backoff-then-success)
  - [x] Zero network: every GitHub interaction stubbed; `time.sleep` neutered for test speed
  - [x] Wired into **both** workflows: `pip install pytest` + `python -m pytest tests/ -q`
        (deploy runs it before verify; backfill runs it before harvesting)
  - [x] README Quick Start gains step 5 documenting both invocations

## Verification gates (all passed)

- [x] `python3 -m unittest discover -s tests -v` — **14/14 pass**, no network, 0.005 s
- [x] Exact CI command `python -m pytest tests/ -q` (clean venv) — **14 passed in 0.04 s**
- [x] `python3 pipeline/verify_catalog.py` — **OK: 123,153 repositories consistent** (artefacts untouched)
- [x] `npm run build` succeeds after header/callback changes (vite, 3.2 s)
- [x] `npm run smoke` passes against the freshly built dist (123,153 consistent)
- [x] R0.2 command verified standalone: `node web/smoke-test.mjs web/public` — **OK**
- [x] Both workflow YAMLs parse (`deploy.yml`, `backfill_123k.yml`)
- [x] Header now renders `… Galaxy (123,153 catalog · 1,600 rendered · top 450 linked)`
      with tooltip; stats segment hidden until the graph's first report (no `0 rendered` flash)

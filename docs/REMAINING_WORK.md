# Remaining work after W1 — detailed checklist

Companion to `docs/EXPERT_PANEL_REVIEW.md` (findings) and `docs/W1_CHECKLIST.md` (done).
W1 closed: **#1 Stack-Architect crash, #2 harvest silent-loss paths (all four), #7a/7b Graph3D
wiring, #6 seed clobber, #14 smoke-in-deploy**. §0 follow-up cuts closed: **R0.1 (#7c honest
node counts), R0.2 (smoke in backfill CI), R0.3 (harvest test suite in both workflows)**.
Everything from §1 downward is still open, ordered as W2 → W3 → W4 → cross-cutting ops. **Standing rule for every item: zero LLM calls — deterministic
rules, hashing, statistics, or precomputed-at-pack-time indexes only.**

---

## 0. Deliberate W1 scope cuts — small, do first

**Status: DONE (2026-09-24)** — verified per `docs/R0_CHECKLIST.md`; checks below kept for traceability.

- [x] **R0.1 — Honest graph node counts (finding #7c).** `App.jsx` header rendered
  `3D Topological Knowledge Galaxy (123,153 Nodes)` while `Graph3DExplorer` samples ≤1,600 nodes
  and links only the first 450. *Files:* `web/src/App.jsx` (header + `graphStats` state),
  `web/src/Graph3DExplorer.jsx` (exports `GRAPH_SAMPLE_LIMIT`/`GRAPH_LINK_LIMIT`, reports live
  `{filtered, rendered, linked}` via `onStatsChange`). *Accept:* header shows catalog total AND
  rendered count — now `123,153 catalog · 1,600 rendered · top 450 linked`, live under filter
  changes, with a tooltip explaining the star-ranked sample.
- [x] **R0.2 — Smoke test in the backfill workflow (finding #14).** `deploy.yml` now runs
  `npm run smoke`, but `backfill_123k.yml` could still open a PR with artefacts that fail the
  decode contract. *Files:* `.github/workflows/backfill_123k.yml`. *Accept:* Node 20 pinned +
  `node web/smoke-test.mjs web/public` after `verify_catalog.py` and before the PR step —
  verified standalone against the live `web/public` (OK).
- [x] **R0.3 — Promote today's harvest probes to a real test file.** The 7 probes used to verify
  W1 live only in session history. *Files:* new `tests/test_harvest_enumerate.py`
  (window_clause cases, probe-None, planner abort, partial-window raise, page-cap raise,
  clean-window pass + gap-free split and fork-axis planner integration — 14 tests total)
  + wired `python -m pytest tests/ -q` into both workflows (after `pip install pytest`:
  deploy runs before verify, backfill runs before harvesting).
  *Accept:* tests run in CI; no network calls (fake `GitHub` stubs) — 14/14 pass under both
  `unittest` and `pytest`.

---

## 1. W2 — Correctness (the classification brain + gates)

### 1.1 Taxonomy v2 — token scoring + margins (finding #3, P0)
*File:* `pipeline/taxonomy_engine.py` (`classify_domain_and_subsystem`, `TAXONOMY_RULES`)
- [ ] **Tokenize, don't substring.** Split corpus on non-word boundaries (hyphen-aware:
  `key-value` = one token *and* two). Keyword hit = exact token membership. Kills
  `os`⊂*repository/host/gpt-oss*, `ai`⊂*rails/email*, `sql`⊂*graphql*.
- [ ] **Short-keyword guard.** Keywords <3 chars (`os`, `ai`, `sql`, `ann`, `arm`, `web`)
  match only as full tokens, never inside other words.
- [ ] **Margin rule.** `domain = best` only if `best ≥ min_score (≈3) AND best − second ≥ margin (≈2)`;
  otherwise `Other / General`. Converts "first accidental +1 wins" into calibrated decisions —
  the honest `Other` share will rise; that is correctness, not regression.
- [ ] **Kill dict-order tie-breaks.** Deterministic order `(score, exact-topic-hits, alphabetical)`.
  OS currently wins every tie by being declared first (measured: 85.5% of a 3k probe classified
  at score ≤1; word-boundary rescore flipped 40.1%).
- [ ] **Lexicon gap fills** from spot checks: `angular|vue|svelte|nuxt` under Web, `observability`
  under Cloud, message-queue synonyms (`nats|pulsar|rabbitmq|kafka|redpanda`), `graphql` must not
  borrow `sql`, multi-word keywords (`zero-copy`, `service-mesh`, `message-queue`) as compiled
  alternation regexes with `\b`, not substrings.
- [ ] **Emit `domain_margin` into Tier-1** (one small capped int; schema change — see R1.5).
  UI gets a "low-confidence label" badge + filter; you get a ranked to-fix list.
- *Accept:* golden-set harness (R1.5) ≥95% on famous repos; *ollama, nginx, vscode, rails,
  spring-boot, grafana, curl, FFmpeg* classify to expert-agreed domains; churn histogram printed.

### 1.2 Artifact classifier v2 — scored rules (finding #13, P2)
*File:* `pipeline/taxonomy_engine.py` (`classify_artifact`)
- [ ] Replace ordered if-chain with weighted evidence: name pattern `^awesome-` ≫ topic
  `awesome-list` ≫ exact token `cli`/`tui` (never `client`) ≫ token `library|sdk` ≫ …;
  demote `engine/service` unless server-ish signals also present.
- *Accept:* `Application / Service` share drops from 70.7% to a real minority (target <50%);
  `redis-client` no longer → *Developer Tool / CLI*; `Query engine library` no longer → *System Service / Engine*.

### 1.3 `reclassify_catalog.py` — make taxonomy fixes reach live rows (finding #5, P1)
- [ ] New `pipeline/reclassify_catalog.py`: re-run `classify_*` over every row using stored
  Tier-2 description + topics; write labels back; regenerate **all four artefacts through
  `rebuild_catalog`'s writer** (never hand-edit).
- [ ] `--dry-run` prints a label-diff histogram (rows changed per domain); fails if churn > N%
  unless `--allow-churn`.
- [ ] Wire into backfill workflow after `rebuild_catalog.py`.
- *Accept:* dry-run on the live 123k shows a reviewable histogram; live run keeps
  `verify_catalog.py` green.

### 1.4 Store topics going forward (finding #5, second half)
*Files:* `pipeline/rebuild_catalog.py` (shard writer), `pipeline/harvest_enumerate.py` already fetches 8 topics and `taxonomy_engine.enrich_repository_record` keeps them — `rebuild_catalog` currently discards them.
- [ ] Persist `topics` (cap 8) in Tier-2 deep records; surface in modal later (W3 search + W4 facets depend on this).
- *Accept:* new/re-harvested rows carry `topics` in `data/details/*.json`; `verify_catalog` optionally checks topic cap.

### 1.5 Golden-set regression harness (feature 3.5)
- [ ] New `tests/golden_repos.json`: 200–500 hand-labeled fixtures (famous + adversarial:
  *ollama, nginx, rails, graphql servers, awesome-lists, client libraries, gpt-oss, rails/email* traps).
- [ ] `tests/test_taxonomy_golden.py` asserts domain/artifact/subsystem per fixture; runs in CI
  **before** deploy.
- *Accept:* red on any lexicon/rule change that moves a fixture; thresholds documented in README.

### 1.6 Reconcile in CI (finding #4, P1)
- [ ] Run `pipeline/reconcile_stale_rows.py` in `backfill_123k.yml` (before `rebuild_catalog.py`),
  so deleted/sub-threshold/renamed repos leave the catalog instead of persisting stale ≥500★ rows
  forever. *Accept:* workflow invokes it; PR body lists reconciled drops/renames.

### 1.7 Implement verify check #4 + hook bound (finding #10, P1)
*File:* `pipeline/verify_catalog.py`
- [ ] Actually verify per-domain shard membership: `misplaced` counter (line ~122) is declared but
  never incremented — compute each row's expected shard slug and compare against its record's `shard`.
- [ ] Add `hook ≤ 90` chars check (writer truncates; gate doesn't verify).
- *Accept:* a deliberately misplaced row in a unit test makes the gate fail; live run still passes.

### 1.8 Curated seed ELI5 never reaches the shipped catalog (finding #6, second half)
- [ ] Decide: (a) merge `generate_seed.py`'s 16 hand-written `beginner_intel` cards into Tier-2 for
  those exact `owner/name`s (they are currently orphaned — 100% of shipped Tier-2 is the template),
  or (b) drop the curated-copy implication from docs. *Accept:* either the 16 cards appear in the
  shards, or docs stop implying they ship.

---

## 2. W3 — Leverage (ranked search + graph + activity)

### 2.1 Pack-time inverted index + BM25-lite ranking (finding #8, P1)
*Files:* `pipeline/rebuild_catalog.py` (new writer), `web/src/App.jsx` (query path)
- [ ] At pack time build `token → row-ordinals` + document frequencies; ship one gzip-friendly
  JSON (~2–4 MB est.).
- [ ] Client scores with field-weighted BM25-lite: `name > owner > subsystem > domain > hook`,
  tie-break `log(stars)` (deterministic, genuinely sub-5ms, replaces stars-desc-only ordering).
- *Accept:* `'sql vector'`, `'simd'`, `'raft'` return relevant top-10 in <5 ms on the built index.

### 2.2 Search what you already know (finding #8)
- [ ] Include `primitives`, `license`, `compatibility`, `topics` (after R1.4) in searchable fields.
  Measured gaps today: `'simd'` → 48 hits though 142 rows carry the primitive; `'sql vector'` → 1 hit.
- [ ] Add smoke-test assertions: `'simd'`, `'sql vector'`, `'raft'` each return ≥N hits.

### 2.3 Search runtime hygiene (finding #8, cheap)
- [ ] Memoize per-repo corpus once at unpack (today rebuilt per keystroke); debounce input ~120 ms.
- *Accept:* keystroke-to-render stays <5 ms on 123k rows during typing bursts.

### 2.4 Pack-time kNN edge list (findings #7c/#7d + §2.E)
- [ ] For every repo compute top-k (k≈8) neighbors: weighted Jaccard over
  `(topics, subsystem, primitives, compatibility)`; ship `edges.json` once.
  Fixes four graph defects at once: O(450²) runtime synthesis, first-450-only links,
  compatibility dead-wiring (keep R-done client derivation as fallback), and `General *` clique noise
  (65-node buckets → 2,080 edges today).
- [ ] Graph3D consumes `edges.json`; all 123,153 nodes get meaningful neighborhoods (layout may
  still sample visible nodes, but links come from real data).
- *Accept:* every sampled node has ≥1 edge; no single bucket contributes >X% of edges.

### 2.5 "Similar repositories" Neighbors tab (feature 3.4)
- [ ] Modal tab: top-5 neighbors from `edges.json` with template reason strings
  ("shares subsystem **Vector Database** + primitive **HNSW**"). Deterministic, explainable.

### 2.6 Activity & freshness intelligence (features 3.2 + finding #11)
*Files:* GraphQL query in `pipeline/harvest_enumerate.py` (and legacy ingest), pack writer, UI
- [ ] Add `isArchived`, `createdAt`, `pushedAt` (already present) — derive at pack time:
  **Active / Idle / Archived badges**, "recently pushed" sort, dormant-repo filter.
- [ ] **Maturity v2** finally uses `pushed_at`/`forks` — a 10-year-dormant repo must not read
  "Production Battle-Tested" (finding #11).
- [ ] Remove the fabricated `pushed_at: "2026-09-01T00:00:00Z"` fallback in
  `rebuild_catalog.py` (line ~397): write `null` + let UI guard it (also fixes `Invalid Date` flash).

### 2.7 License normalization + working facet (finding #12, P2; feature 3.7)
- [ ] Map junk (`Open Source` 16,393 / `Unknown` 15,069 / `NOASSERTION` 11,946) → `Unknown`;
  intern a tier column (`permissive | copyleft | source-available | unknown`) from existing SPDX rules.
- [ ] UI: wire the never-called `setSelectedLicenseTier` setter to a real control + "permissive-only"
  filter; stop rendering raw `NOASSERTION` badges.

### 2.8 Facet counts + badge truth (features 3.11 partial, finding #14)
- [ ] Precompute facet counts at pack time → chips like `Databases (3,800)` (absent today).
- [ ] Fix the README/badge claim *3.2 MB gzip* — measured `catalog-packed.json` gzips to **7.58 MB**
  (or re-partition to actually hit 3.2 MB).

---

## 3. W4 — Next level (pick by appetite, sequential)

### 3.1 SQL Studio — make the README true (finding #9, feature 3.1) — *flagship*
*File:* `web/src/App.jsx` (dead state lines ~59–64 already exist)
- [ ] `sql.js` (WASM SQLite — **not an LLM**) loads Tier-1 into an in-memory table on first open
  of the SQL tab (lazy; zero cost to Explorer users), runs the documented
  `SELECT/WHERE/ORDER BY/LIMIT`, CSV export via `URL.createObjectURL`.
- [ ] Fallback if WASM weight is unwanted: tiny deterministic filter-expression parser (still no server).
- *Accept:* README §2 promise becomes accurate; demo query in state executes; CSV downloads.

### 3.2 Star-delta trending (feature 3.3 — your moat)
- [ ] Persist `(id, stars, snapshot_date)` per backfill (columnar, ~1–2 MB/yr compressed).
- [ ] Outputs: "Rising this month" shelf, per-repo sparkline in modal, percentile momentum badge.
  Pure subtraction.

### 3.3 Backfill changelog view (feature 3.9)
- [ ] Diff consecutive packed snapshots → `/changelog`: added/removed, label changes, domain moves.
- [ ] Extend the backfill PR body with top movers (it already prints counts).

### 3.4 Signal score (feature 3.8)
- [ ] Pack-time composite, formula documented in README:
  `signal = f(stars percentile, push recency, fork ratio, has release)` → "Signal" sort + slider.
  No black box — arithmetic users can audit.

### 3.5 Topic facets + Ecosystems tab (feature 3.6, depends on R1.4)
- [ ] Topic facet, topic cloud per domain, topic-based search (folds into 2.2),
  pack-time **topic co-occurrence map** as a new "Ecosystems" tab.

### 3.6 Deterministic Stack Blueprints library (feature 3.10)
- [ ] Grow the 4 hardcoded templates into a curated JSON library per domain (role slots +
  required subsystems + compat edges), validated at build time ("every named repo exists in the
  catalog"). Rule engine picks/completes stacks — constraint satisfaction, zero-LLM.

### 3.7 Perf/UX hygiene pass (feature 3.11)
- [ ] Web Worker for filter+search (60 fps while filtering 123k rows).
- [ ] Group the 297 long-tail languages into "Other" in the language facet.
- [ ] Touch handlers for both canvases (galaxy is mouse-only today).
- [ ] Discovery pills reset unspecified facets (today they only set mentioned ones).
- [ ] `?inspect=` prefers `owner/name` match over bare name (bare-name can hit the wrong repo).
- [ ] Guard `pushed_at` before `Date.parse` (kills `Invalid Date` flash until 2.6 lands).

### 3.8 Stack synergy normalization (§2.E part 2, finding #15 P3 — file `InspirationGenerator.jsx`)
- [ ] Score = **mean over pairs**, not raw sum, so 2-slot and 6-slot stacks compare.
- [ ] Slots declare a *required subsystem* ("Vector Store" → subsystem ∈ {Vector Database, …});
  candidates filtered/boosted by it.
- [ ] Deterministic protocol compatibility matrix derived from `COMPATIBILITY_RULES`
  (Postgres-compatible ↔ pg drivers, OpenAI-compatible ↔ OpenAI clients…).
- [ ] Seeded RNG for "Shuffle" (reproducible); same-language alone must not mean "High Synergy".

---

## 4. Cross-cutting ops / pipeline hygiene (P2–P3)

- [ ] **O.1 — Checkpoint manifest keyed by clause only (finding #15).** `Checkpoint` keys include the
  volatile `count`, so cross-run resume only works when same-day probes match; and `Checkpoint.seen`
  isn't reloaded from the output file, so crash-resume appends duplicate lines (wasteful; harmless
  post-merge). *Accept:* interrupted run resumes exactly; `seen` populated at startup.
- [ ] **O.2 — Surface `stats.json` in the backfill PR body** (`windows_failed`, `windows_truncated`,
  universe estimate) so coverage is visible even when the run is green.
- [ ] **O.3 — Delta-poor monthly commits (finding #14).** Backfill rewrites ~310 MB of single-line
  JSON (`separators=(',',':')`) into git — history grows ~310 MB/run. Consider pretty-printed
  artifacts (git deltas) or storing large artifacts outside git with CI download.
- [ ] **O.4 — `repos.json` is a byte-identical 63 MB twin of `catalog-index.json` (finding #14).**
  Decide: keep as documented legacy alias with a generation check, or drop it from writers and
  migrate readers (touches `verify_catalog` parity check + README).
- [ ] **O.5 — Python unit-test lane in CI.** Both workflows run zero Python tests (only
  `verify_catalog`). Fold R0.3 + golden-set (1.5) into a `tests/` job that runs on every push.
- [ ] **O.6 — Legacy harvester archive decision.** `ingest.py` + 8 legacy harvesters
  (`harvest_scale.py`, `backfill_worker.py`, `scale_50k.py`, `pack_index.py`, `shard_manager.py` …)
  are reference-only; either move to `legacy/` with a README note or delete (keep `scale_50k` doc
  warning — salted-hash footgun).
- [ ] **O.7 — README overclaims audit.** Beyond SQL Studio (3.1): "sub-5ms" search claim should be
  measured and asserted (2.3), `reconcile` described as "optional" should reflect R1.6, and
  `docs/AI_TOOLS_METHODOLOGY_BLUEPRINT.md` (10 AI domains, 5 agent personas) needs an explicit
  "no-LLM constraint applies" cross-reference if that phase proceeds.

---

## 5. Zero-LLM guardrail (applies to all of the above)

- [ ] Standing check: repo-wide grep for LLM/AI SDK calls stays empty — add it as a CI grep step
  alongside `verify_catalog` so the constraint is *enforced*, not just documented.
  Pattern used at review time: `openai|anthropic|gpt|claude|gemini|llm_api` outside static lexicons.

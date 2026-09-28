# GitScour — Multi-Expert Panel Review

**Date:** 2026-09-24 · **Branch:** `arena/01a0d2cb-gitscour` · **Catalog under review:** 123,153 repositories (committed artifacts)

**Hard constraint (verified, not assumed):** the system today makes **zero LLM calls** — a repo-wide grep
for `openai|anthropic|gpt|claude|gemini|llm_api` finds only static lexicon strings. Every recommendation
below preserves that: all proposals are deterministic rules, hashing, statistics, or precomputed-at-pack-time
indexes. Anything that smells like "just let a model label it" was explicitly rejected by the panel.

---

## 0. The panel & how we reviewed

| Expert | Lane |
|---|---|
| **E1 — Distributed Data Engineer** | `harvest_enumerate.py`, checkpointing, rate limits, window planning, CI workflows |
| **E2 — Taxonomy / IR Researcher** | `taxonomy_engine.py`, scoring logic, label quality, artifact classification |
| **E3 — Search & Frontend Perf Engineer** | `App.jsx`, `Graph3DExplorer.jsx`, query path, decode contract, payload sizes |
| **E4 — Product & UX Strategist** | Stack Architect, 3D galaxy, modals, README promises vs. shipped UI |
| **E5 — QA / Release Engineer** | `verify_catalog.py`, `rebuild_catalog.py`, `smoke-test.mjs`, gates, footguns |

**Method:** full source read of all 15 pipeline scripts, 5 JSX units, both workflows — plus *executed probes*:
`verify_catalog.py` and `smoke-test.mjs` were run against the committed artifacts (both pass), the taxonomy was
re-executed on catalog rows under controlled variants, the Stack-Architect crash was reproduced in isolation,
and the harvest query builder was called directly with window edge cases. Every finding below cites evidence.

---

## 1. Soundness verdict (the part you asked for first)

**Overall: the *architecture* is sound; the *classification brain* is not; the *harvest* has four silent-loss
paths; the *UI* has two dead wirings and one crash.** Integrity gates are genuinely strong — the failure modes
are all in logic that the gates don't cover (they check *consistency*, not *correctness*).

### What is solid (keep it)

| Area | Evidence |
|---|---|
| Single-writer artifact consolidation | `rebuild_catalog.py` is the only writer for all 4 artifact families; README documents the historical drift bug (1,276 vs 51,192 rows) and the fix is real |
| Integrity gate | `verify_catalog.py` **passes live**: 123,153 rows, id parity across packed/index/repos, 123,153 deep records, 0 stray/0 missing, all ids JS-safe (< 2⁵³), star floor holds (min = 500), stars sorted desc, 0 duplicate `owner/name` (4.1 s) |
| Decode contract test | `smoke-test.mjs` **passes live**: Tier-1 unpack, lazy Tier-2 merge, fallback parity (3.1 s) |
| Window-partitioned enumeration | The bisection idea is the *correct* algorithm vs. GitHub's 1,000-result cap; split arithmetic `[lo..mid] / [mid+1..hi]` has no gaps or overlaps (verified by direct call) |
| Rate-limit hygiene | Token-bucket `Limiter`, `Backoff` on GraphQL budget, retry escalation, `Retry-After` respect — present and sane |
| Stable ids | `blake2b(owner/name)` into [2⁴⁰, 2⁴¹) is reproducible, collision-probed, JS-exact; `scale_50k.py`'s salted-hash footgun is documented and quarantined in docs |
| Determinism | Rebuild output is sorted and deterministic; maturity recomputed each pass; no hidden randomness |
| Zero-LLM operation | Verified by grep — caveat satisfied today |

### Soundness scorecard

| # | Finding | Sev | Lane |
|---|---|---|---|
| 1 | **Stack Architect white-screens on the 2nd slot selection.** Default pool hardcodes `repoId: 44211562` (duckdb's *real GitHub* id) but the catalog's duckdb id is synthetic `1723124929169`. `repoMap.get()` → `undefined`; the guard `.filter(item => item.repo !== null)` **keeps `undefined`** (`undefined !== null`); the self-heal `if (!customPool[0].repoId)` never fires (truthy). Select one more repo → pairwise loop derefs `a.language` → `TypeError` → whole tab dies. **Reproduced in isolation.** | **P0** | E4 |
| 2 | **Harvest can lose data silently — four paths.** (a) Mid-pagination `RuntimeError` → `break` → `work()` still calls `ckpt.complete(window)` → *partial window permanently checkpointed as done* (`harvest_enumerate.py:284`, `:363`). (b) `probe_count` failure returns `0` → plan skips that star range entirely (`:182`, `:198`) — transient probe error = missing universe slice. (c) Atomic-star overflow marks `truncated: true` and harvests `sort:stars-desc` *ties* (arbitrary 1,000) — tail lost; CI never fails on `windows_truncated`. (d) **Open-ended fork window emits `forks:1001` = EXACT match** (`window_clause:166-172`, verified by call): repos with >1,001 forks at that star value are never fetched. Likely bites at `stars:500` exactly, where repo density is highest. | **P0** | E1 |
| 3 | **Taxonomy scoring is statistically unsound.** Keyword match is raw substring (`kw in text_corpus`, `taxonomy_engine.py:260`): `os` matches *repository, host, cross, most, gpt-oss*; `ai` matches *rails, email*. No minimum score → a single +1 assigns a domain (85.5% of a 3,000-row probe had score ≤ 1). Ties favor **Operating Systems** because it's the first dict key and `>` keeps first max. Controlled word-boundary re-score shifted **40.1%** of labels (hook-only approximation — an upper bound, but famous-repo ground truth confirms: *ollama→OS, nginx→OS, vscode→OS, rails→AI, spring-boot→Other, angular(Dart)→OS*). Corpus also lacks basic keywords (no `angular`/`vue`/`svelte` under Web), and `graphql` contains `sql` → GraphQL tools tie-break into **Databases**. | **P0** | E2 |
| 4 | **Stale rows never leave the catalog in CI.** `reconcile_stale_rows.py` is never invoked by either workflow (grep: no match). Deleted/sub-threshold repos keep stale ≥500★ rows forever (verify passes because it checks *stored* stars); renames leave duplicate rows until someone runs reconcile manually — README itself calls it "optional". | **P1** | E1/E5 |
| 5 | **No re-classification path exists.** `merge_harvest` refreshes stars/forks/description/topics/language but **never re-runs** `classify_domain_and_subsystem` for existing rows. Domain/subsystem is assigned once at insert. So fixing finding #3 cannot change the live 123k rows — no `reclassify` migration script exists. (Also: harvested **topics are discarded** — not stored in any artifact — so a reclassify pass would have to re-fetch them.) | **P1** | E2/E5 |
| 6 | **README quick-start step 2 breaks the build.** `python3 pipeline/generate_seed.py` overwrites `web/public/repos.json` (a 63 MB live artifact) with **20 seed records** → `verify_catalog` id-parity check fails → deploy fails until `git restore`. Worse: the curated ELI5 copy in `generate_seed.py` is **orphaned** — 100.0% of the 123,153 Tier-2 `beginner_intel` records are the template (`A foundational …`), only 2,303 unique texts (= language×domain×subsystem combinatorics). The hand-written seeds never reach the shipped catalog. | **P1** | E5/E4 |
| 7 | **3D galaxy: dead wiring + misleading labels.** (a) Cluster-filter dropdown above the graph sets `selectedDomain` prop, but `Graph3DExplorer` copies it into `filterDomain` state **once** with no sync effect → dropdown inert while the tab is open; `filterMinStars` has *no UI at all* (setters never called — grep). (b) App never unpacks `compatibility` from Tier-1 → `repo.compatibility || []` → **"Shared Interop" edges can never fire**. (c) Links are only synthesized among the **first 450** nodes; nodes sampled ≤ 1,600 of 123,153 — yet the header says *123,153 Nodes*. (d) Shared-*General\** subsystem cliques (65 nodes → 2,080 edges in one bucket) make the link set mostly semantic noise. | **P1** | E3/E4 |
| 8 | **Advertised search queries return almost nothing.** Corpus = `name + owner + hook + language + domain + subsystem` — **no primitives, no license, no compatibility, no topics/keywords**. Measured on the live index: `'sql vector'` → **1 hit**, `'simd'` → 48 (142 rows carry the SIMD primitive), `'caching'` → 97. No relevance ranking (stars-desc only), corpus is rebuilt per keystroke (no memo, no debounce) despite the "sub-5ms" claim. | **P1** | E3 |
| 9 | **SQL Studio does not exist.** README §2 promises a "WebAssembly SQL execution console … one-click CSV export". `App.jsx:59-64` has `sqlQuery/sqlResults/sqlError` state and **zero rendering code** (grep: only the `useState` lines). Dead state + broken promise. | **P1** | E4/E5 |
| 10 | **`verify_catalog` docstring overclaims.** Check #4 ("per-domain shard membership matches each row's `shard` slug") is **not implemented** — `misplaced = 0` at `verify_catalog.py:122` is never incremented. The gate is otherwise good. | **P1** | E5 |
| 11 | Fabricated data: shard writer falls back to `"pushed_at": "2026-09-01T00:00:00Z"` (`rebuild_catalog.py:397`) — currently 0 rows hit it, but inventing timestamps is wrong; UI shows `Invalid Date` until the shard loads. `classify_maturity(stars, forks, pushed_at)` **ignores** `forks` and `pushed_at` entirely — a 10-year-dormant repo still reads "Production Battle-Tested". | **P2** | E2/E3 |
| 12 | Licenses: 35% junk (`Open Source` 16,393 + `Unknown` 15,069 + `NOASSERTION` 11,946) surfaces as raw badges like `NOASSERTION` in cards; the license filter state exists but has **no UI control** (setter never called). | **P2** | E2/E4 |
| 13 | Artifact classifier: ordered substring chain — `"cli"` ⊂ *client* → *"A Redis client library"* classified **Developer Tool / CLI**; `"engine"` check precedes library check → *"Query engine library"* → **System Service / Engine** (both reproduced). Net effect: 70.7% falls into the `Application / Service` catch-all; the dimension carries little signal. | **P2** | E2 |
| 14 | Ops/repo hygiene: monthly backfill rewrites ~310 MB of **single-line JSON** (`separators=(',',':')`) into git — delta-poor, history grows ~310 MB/run; `repos.json` is a byte-identical 63 MB twin of `catalog-index.json`; badge claims *"3.2MB Gzip"* but packed actually gzips to **7.58 MB** (measured). Smoke test exists but is **not in CI** (grep both workflows: no match). | **P2** | E1/E5 |
| 15 | Checkpoint manifest keys include the volatile `count` field → resume only works when a same-day re-plan probes identical counts; `Checkpoint.seen` isn't reloaded from the output file → crash-resume duplicates lines (harmless post-merge, wasteful). `InspirationGenerator` also does setState-during-render + side-effectful `useMemo`, uniform-random "battle-tested" picks, and an un-normalized synergy score (6 pairs vs 1 pair not comparable). | **P3** | E1/E4 |

**Panel consensus on "is the logic sound across the board?"** — *No, not yet.* The data plumbing and integrity
gates are production-grade. The classification algorithm (the product's core value proposition), the harvest's
completeness guarantees, and two UI wiring bugs need the fixes below **before** trusting the next backfill.

---

## 2. Algorithm improvements (core ask — all zero-LLM)

### A. Taxonomy v2 — replace substring scoring with token scoring + margins
1. **Tokenize, don't substring.** Split the corpus on non-word boundaries (hyphen-aware: `key-value` is one
   token *and* two). Keyword hit = exact token membership. This alone kills `os`⊂*repository*, `ai`⊂*rails*,
   `sql`⊂*graphql*, `ann`⊂*channel*.
2. **Guard short keywords.** Any keyword < 3 chars (`os`, `ai`, `sql`, `ann`, `arm`, `web`) only matches as a
   full token, never inside another word.
3. **Score with a margin rule.** `domain = best` only if `best ≥ min_score AND best − second ≥ margin`
   (e.g. min 3, margin 2); otherwise `Other / General` *and record why*. This converts today's
   "first accidental +1 wins" into calibrated decisions; expect the honest `Other` share to rise — that's
   correctness, not regression.
4. **Kill dict-order tie-breaks.** Deterministic tie order: `(score, exact-topic-hits, alphabetical)`.
   Today OS wins every tie by being declared first.
5. **Emit confidence into Tier-1.** One small int: `domain_margin` (capped). UI gets a "low-confidence label"
   badge and a filter; you get a ranked to-fix list. Fully deterministic.
6. **Fill lexicon gaps** surfaced by the spot checks: `angular|vue|svelte|nuxt` under Web, `observability` under
   Cloud (or a new facet — see §3.6), `message-queue` synonyms, etc. Multi-word keywords as compiled
   alternation regexes (`\bzero-copy\b`), not substrings.
7. **Artifact classifier → scored rules.** Replace the ordered if-chain with weighted evidence
   (name pattern `^awesome-` ≫ topic `awesome-list` ≫ token `cli`/`tui` ≫ token `library|sdk` ≫ …),
   exact-token `cli` (never `client`), and demote `engine/service` unless the repo also has server-ish signals.
   Expected: `Application / Service` share falls from 70.7% to a real minority.

### B. Reclassification pipeline (makes A land on the live catalog)
- New `pipeline/reclassify_catalog.py`: re-run `classify_*` over every row using **stored** Tier-2 description +
  topics, write labels back, regenerate all four artifacts through `rebuild_catalog`'s writer (never hand-edit).
- **Store topics going forward** (cap 8, already fetched) in Tier-2 — today they're thrown away after enrich;
  without them reclassification quality degrades and search can't use the best signal GitHub gives us.
- CI-safe: run with `--dry-run` first, print a label-diff histogram (rows changed per domain), fail if >N%
  churn without an explicit `--allow-churn` flag.

### C. Harvest v2 — make completeness a *guarantee*, not a hope
| Bug | Fix |
|---|---|
| Partial window marked complete | `harvest_window` must **raise** on mid-pagination `RuntimeError`; only `ckpt.complete()` after a clean `hasNextPage == false` (or legit page-cap) |
| Probe failure → window skipped | `probe_count` returns `None` on error; plan treats `None` as "retry harder / abort run" — never as count 0 |
| `forks:1001` exact-match tail loss | Use documented open-ended qualifier **`forks:>=1001`** (github/docs shows `forks:>=205`) or recurse the fork axis: bisect `[fork_lo..fork_hi]` like the star axis instead of giving up at `truncated` |
| Truncated windows ignored by CI | Exit non-zero if `windows_truncated > 0` (or surface prominently in the PR body) — silent coverage holes are worse than failed runs |
| Manifest key includes volatile `count` | Key windows by the **clause only** (`star_lo/star_hi/fork_lo/fork_hi`); reload `seen` keys from the output file at startup to avoid duplicate lines on resume |

### D. Search v2 — rank, and search what you already know
- **Precompute at pack time** (not runtime, no LLM): an inverted index `token → row-ordinals` with document
  frequencies; ship as one gzip-friendly JSON (~2–4 MB est.). Client does a **BM25-lite / field-weighted**
  scoring pass: `name > owner > subsystem > domain > hook`, tie-break `log(stars)`. Deterministic, genuinely
  sub-5ms, and fixes "matching but unranked".
- **Include primitives, license, compatibility, topics** in the searchable fields (all already computed except
  topics — see B). Advertised examples should be *tests*: add `smoke-test` assertions that `'simd'`,
  `'sql vector'`, `'raft'` return ≥ N hits.
- Cheap runtime wins meanwhile: memoize `corpus` once per repo at unpack, debounce input 120 ms.

### E. Graph & Stack scoring v2
- **Pack-time kNN edge list.** For each repo compute top-k (k≈8) neighbors by weighted Jaccard over
  `(topics, subsystem, primitives, compatibility)`; ship `edges.json` once. Fixes all three graph defects at
  once: O(n²) runtime synthesis, first-450-only links, dead `compatibility` (store it in Tier-1 unpack), and
  clique noise from `General *` buckets. Neighborhoods become meaningful for *every* node.
- **Stack synergy: normalize and constrain.** Score = mean over pairs (not raw sum) so 2-slot and 6-slot
  stacks are comparable; slots declare a *required subsystem* (e.g. "Vector Store" → subsystem ∈ {Vector
  Database, …}) and candidates are filtered/boosted by it; add a deterministic **protocol compatibility matrix**
  derived from the existing `COMPATIBILITY_RULES` lexicon (Postgres-compatible ↔ pg drivers, OpenAI-compatible ↔
  OpenAI clients…). Reproducible shuffles via seeded RNG. Same language ≠ "High Synergy" by itself.

---

## 3. Additive features to take it to the next level (all zero-LLM)

Ranked by impact ÷ effort. None require a model at build time or runtime.

### 3.1 Ship SQL Studio for real (make the README true) — *flagship*
`sql.js` (WASM SQLite) is not an LLM: load Tier-1 into an in-memory table **on first open of the SQL tab**
(lazy, so zero cost to Explorer users), run the documented `SELECT/WHERE/ORDER BY/LIMIT`, CSV export via
`URL.createObjectURL`. The state variables already exist; the README already promises it; the caveat holds.
*(Fallback if WASM weight is unwanted: a tiny deterministic filter-expression parser — still no server.)*

### 3.2 Activity & freshness intelligence
Add three free fields to the GraphQL query: `isArchived`, `createdAt`, `pushedAt` (already), optionally
`latestRelease { publishedAt }`. Derive, at pack time: **Active / Idle / Archived badges**, "recently pushed"
sort, dormant-repo filter, and *Maturity v2* that finally uses recency (fixes P2 #11). Pure date arithmetic.

### 3.3 Star-delta trending across backfills
You already re-harvest monthly. Persist `(id, stars, snapshot_date)` deltas (columnar, ~1–2 MB/compressed year).
Outputs: **"Rising this month"** shelf, per-repo sparkline in the modal, percentile momentum badge.
Pure subtraction. This is data only *you* accumulate — a genuine moat.

### 3.4 "Similar repositories" / ecosystem neighbors
Same pack-time kNN as E's `edges.json`, surfaced in the modal as a *Neighbors* tab (top-5 with reason strings
like "shares subsystem **Vector Database** + primitive **HNSW**"). Reason strings are template fills over
computed overlap — deterministic, explainable, zero-LLM.

### 3.5 Golden-set regression harness (quality infrastructure)
200–500 hand-labeled fixtures (famous repos + adversarial cases: *ollama, nginx, rails, graphql servers,
awesome-lists, client libraries*) as JSON; a pytest asserts domain/artifact/subsystem; run in CI **before**
deploy. Locks in Taxonomy v2 and turns every future lexicon edit into a measured change instead of a gamble.

### 3.6 Topic as a first-class facet
Once topics are stored (§2.B): a topic facet + topic cloud per domain, topic-based search, and
**topic co-occurrence maps** (static, computed at pack time) as a new "Ecosystems" tab — clusters derived from
real co-occurrence instead of hand-drawn buckets.

### 3.7 License normalization + commercial-use facet
Map `NOASSERTION`/legacy `Open Source` → `Unknown`; intern a **tier** column (`permissive | copyleft |
source-available | unknown`) from the existing SPDX rules. UI gets a working license facet (the state already
exists) and a "permissive-only" filter developers actually want.

### 3.8 Signal score (transparent quality ranking)
Pack-time composite, formula documented in README:
`signal = f(stars percentile, push recency, fork ratio, has release)` → a "Signal" sort + slider. No black box —
it's arithmetic users can audit.

### 3.9 Backfill changelog view
Diff consecutive packed snapshots → `/changelog`: repos added/removed, label changes, domain moves. The backfill
PR body already prints counts — extend it with the top movers, and you get "what changed" for free every month.

### 3.10 Deterministic Stack Blueprints library
Grow the 4 hand-written templates into a curated JSON library per domain (role slots + required subsystems +
compat edges), validated at build time ("every named repo exists in the catalog"). A rule engine picks/
completes stacks for a chosen goal — constraint satisfaction over your own index, zero-LLM.

### 3.11 Perf/UX hygiene pass
Web Worker for filter+search (keeps main thread at 60fps on 123k rows), precomputed **facet counts**
("Databases (3,800)" chips — currently absent), fix `Invalid Date` flash (guard `pushed_at`), prefer
`owner/name` match over bare-name in `?inspect=`, pills should reset unspecified facets, group the 297
long-tail languages into "Other", add touch handlers to both canvases (galaxy is mouse-only today).

---

## 4. Prioritized roadmap

| Wave | Items | Effort |
|---|---|---|
| **W1 — Stop the bleeding** | Stack-Architect crash (`!== null` → truthy check + drop stale id); harvest: raise-on-partial, probe `None`, `forks:>=N`, CI fails on truncated; Graph3D prop-sync + unpack `compatibility`; wire `npm run smoke` into `deploy.yml`; fix README quick-start (generate_seed must not target `repos.json`) | days |
| **W2 — Correctness** | Taxonomy v2 (tokenize, margins, tie order, lexicon gaps) + golden-set harness; `reclassify_catalog.py` + store topics; run `reconcile` in the backfill workflow; implement verify check #4; artifact classifier scoring | ~1–2 weeks |
| **W3 — Leverage** | Pack-time inverted index + ranked search; pack-time kNN edges (graph + Neighbors tab); Activity/Archived badges; license tiers; facet counts; badge size truth | ~1–2 weeks |
| **W4 — Next level** | SQL Studio (sql.js), star-delta trending + changelog, Signal score, topic facets/co-occurrence, Stack Blueprints library, Web Worker search | sequential, pick by appetite |

**One-line verdict from the panel:** *the skeleton is excellent and the gates are real — fix the brain
(taxonomy), close the four harvest holes, re-enable reconcile in CI, and then ship the zero-LLM feature set
(SQL Studio, trending, neighbors, activity) that your own data model already supports.*

---

### Appendix — reproduction commands used

```bash
python3 pipeline/verify_catalog.py                 # PASS (4.1s) — parity, ids, star floor, shard coverage
cd web && node smoke-test.mjs <copy of public/>    # PASS (3.1s) — decode + lazy-merge contract
python3 -c "from pipeline.harvest_enumerate import window_clause as w; print(w(500,500,1001,None))"
#  -> 'stars:500 forks:1001 sort:stars-desc'   ← exact-match bug (should be forks:>=1001)
grep -rn "setSelectedLicenseTier(\|setFilterDomain(\|setFilterMinStars(" web/src   # dead setters
grep -n "sqlResults" web/src/App.jsx               # state only, no render path
grep -rn "reconcile\|smoke" .github/workflows/     # neither runs in CI
```

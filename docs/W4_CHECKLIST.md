# W4 — Next level: implementation checklist

Source: `docs/REMAINING_WORK.md` §3 (features 3.1–3.3, 3.6, 3.8–3.11 + finding #15).
Branch `arena/01a0d2cb-gitscour`, predecessor `docs/W3_CHECKLIST.md` (26/26, tip `b694c4d`).
Standing rule: **zero LLM calls at runtime** — everything deterministic, rule-based, auditable.

**Status: IN PROGRESS.**

## Baseline (measured 2026-09-25 before starting)

| Metric | Measured |
|---|---|
| README §2 promise | *"SQL Studio Mode: WebAssembly SQL execution console … (`SELECT`, `WHERE`, `ORDER BY`, `LIMIT`) with one-click CSV export"* — **no SQL tab exists**; state (`sqlQuery/sqlResults/sqlError`) is dead code |
| Tabs | `explorer`, `inspire`, `graph3d` only |
| Languages facet | 343 entries; **282 languages with <50 rows (1,858 rows total)** rendered individually |
| `?inspect=` | `find(name === inspect \|\| owner/name === inspect)` — bare-name **first** (wrong-repo risk); URL writes bare `name` |
| Date guards | modal footer guarded in W3 (pushed/created) — no other unguarded parses found |
| Synergy | `Math.random()` in shuffle/template pick; score = **raw sum** (`totalScore`) across pairs — 2-slot vs 6-slot stacks not comparable |
| Templates | 4 hardcoded pool entries in `InspirationGenerator.jsx` |
| Compat source | `web/src/compatibility.js` `COMPATIBILITY_RULES` (mirrors `pipeline/taxonomy_engine.py`) |

## Execution order (sequential, one commit per chunk)

**A. §3.1 SQL Studio (flagship)** → **B. §3.7 hygiene** → **C. §3.4 signal** →
**D. §3.2+3.3 trending/changelog** → **E. §3.5 topics/ecosystems** →
**F. §3.6 blueprints** → **G. §3.8 synergy** → final gates.

---

## A. §3.1 SQL Studio — make the README true (flagship)

- [x] Add `sql` tab; `sql.js` (WASM, lazy `import()` on first Run — zero cost for
      Explorer users) builds one in-memory `repos` table from the unpacked catalog
      (INSERT in a single transaction; loading state while building)
- [x] Read-only guard: statements must start `SELECT`/`WITH`; errors render inline
- [x] Demo query (existing `sqlQuery` state) executes on demand; Ctrl+Enter runs
- [x] Results grid (200-row preview, honest caption) + **CSV export via `URL.createObjectURL`** (full result)
- [x] UI copy documents the README subset (`SELECT/WHERE/ORDER BY/LIMIT`)
- [x] Smoke gate: node runs sql.js against a sample table — demo query returns 101
      rows from a 5k sample ordered correctly, CSV re-parses cell-for-cell, INSERT/DROP rejected
- *Accept:* README §2 accurate ✓; demo query executes ✓; CSV downloads ✓ (build splits a 44.7 kB js chunk + 659.8 kB wasm asset, both fetched only on first Run)

## B. §3.7 Perf/UX hygiene

- [x] Web Worker for filter+search (`filter-core.worker.js` + `filter-core.mjs`):
      main posts the parsed packed payload once + index updates, worker unpacks a
      light projection and replies with ordered ordinals; sync fallback imports the
      SAME core (single truth); reqId stale-reply guard; failover to sync on error.
      Core cost measured in smoke: identity **6.2 ms**, ranked `'sql vector'`
      **3.1 ms** with top-5 identical to `rankQuery`, deterministic
- [x] Language facet groups the long tail: **282 languages <50 rows (1,858 rows)**
      collapse into one `Long tail` option (rows keep their true language; 61 majors;
      smoke-gated against a recount)
- [x] Touch handlers on both canvases (Graph3DExplorer + Stack3DVisualizer): pointer
      events + `setPointerCapture` + `touch-action: none`; touch contact picks a node
      so tap-to-open works without hover (§E cloud reuses the pattern)
- [x] Discovery pills reset every facet they do not mention (incl. query, dormant,
      sort — minStars stays the user's threshold)
- [x] `?inspect=` prefers `owner/name`, falls back to bare name; share URL now writes
      `owner/name` (bare name was ambiguous)
- [x] `pushed_at` guarded before `Date.parse` — done in W3 (modal footer); re-grep gate
      in smoke stays

## C. §3.4 Signal score

- [x] Pack-time `signal` parallel array (0–100) — `pipeline/signals.py`, exact
      terms frozen in README §4: `round(45·stars_pct + 25·push_recency(548d decay,
      unknown=0.5) + 20·fork_ratio_pct + 10·has_release(install cmd))`; regenned
      len 123,153, range 1–89, mean 45.6
- [x] `Signal` option in Sort select + minimum-signal slider (0–90 step 5, `off`
      at 0) wired App → filterOpts → worker → filter-core (shared path)
- [x] Unit tests pin the formula (13 pins: bounds, stars/recency monotonicity,
      install bonus == 10, unknown == 548·ln2 days, breakdown sums, determinism)
- [x] README: formula section + per-term table (auditable, no black box)

## D. §3.2 + §3.3 Star-delta trending & changelog

- [x] `pipeline/history.py` writes `web/public/history/<date>-stars.json` per rebuild
      (columnar `{names: [...], stars: [...]}`, ~3.7 MB/snapshot) and keeps every
      previous one; same-day re-runs overwrite byte-identically; backfill's existing
      `git add web/public` commits them with the PR
- [x] Rebuild diffs the last two snapshots → `web/public/changelog.json`
      (added/removed + counts, |delta|-sorted top 100 movers with from/to/pct/
      language/domain from packed metadata + per-mover `series` for sparklines;
      first run = honest seeded-baseline note, zero invented movers)
- [x] App: **Rising** tab renders the full changelog (period header, mover/added/
      removed counts, 50-row mover table, added/removed lists, empty states) +
      **"Rising this month"** shelf on Explorer (top 10 resolvable movers, click =
      inspector) + modal **sparkline** (SVG polyline of the per-snapshot series,
      baseline text at 1 point) + **momentum badge** (▲/▼ delta chip, only for
      rows with real history)
- [x] Backfill workflow: `git add web/public` already commits history+changelog;
      PR body now appends a `## Star movers <from> -> <to>` top-10 list parsed from
      `changelog.json` (or the seeded-baseline note); YAML + heredoc dedent verified
- [x] Seeded now: `history/2026-09-25-stars.json` written from the current packed
      rows (smoke asserts names/stars alignment vs packed head); next backfill diffs it

## E. §3.5 Topic facets + Ecosystems

- [x] Topic facet select (+ URL `?topic=`, worker/sync parity via filter-core) +
      per-domain **topic cloud** in Explorer from `facets.topics_by_domain` (global
      cloud when no domain is set; click toggles the filter; honest empty-state copy)
- [x] Pack-time **topic co-occurrence map** (`pipeline/topicmap.py` →
      `web/public/topic-map.json`: df ≥ 25, pair ≥ 10, top-10 edges per topic,
      fully sorted/deterministic) → new **Ecosystems** tab: 48-node deterministic
      spiral, count-weighted links, drag-to-pan, tap a topic = filter + jump to
      Explorer — smoke asserts edge ↔ df invariants and per-domain ≤ global counts
- [x] Touch/pointer handling shared with galaxy (§B): pointerdown/move/up +
      `setPointerCapture` + `touch-action: none`, moved-flag guards tap-vs-pan
- [x] Honest empty states locally (0 topics / 0 pairs today — UI says the backfill
      writes them and cites the 202-fixture golden proof; 8 unit tests pin the
      builder on fixtures)

## F. §3.6 Stack Blueprints

- [x] `web/src/blueprints.json`: grew the 4 hardcoded templates to **8 blueprints**
      (original ids/copy preserved + 4 new across ai/systems/security, >=2 per goal)
      — role slots with exact packed `requiredSubsystem` labels, 4 compat edges
      each, **67 seeds**, all verified present
- [x] Build-time validation: `tests/test_blueprints.py` (7 tests) pins every seed
      `owner/name` + subsystem label against `web/public/catalog-packed.json`,
      goal/category vocabulary, unique ids, edge endpoints, and the original 4 ids;
      smoke §13 repeats the data invariants over the real dist artifacts
- [x] Rule engine `web/src/blueprint-engine.mjs` (pure module shared by UI + smoke):
      slot fill = curated seeds > exact-subsystem match > category fallback, ranked
      by stars with top-3 sampling via seeded RNG — deterministic, zero-LLM, honest
      `repo:null` gap card when a slot truly has no candidate

## G. §3.8 Synergy normalization (`InspirationGenerator.jsx`)

- [x] Score = **mean over pairs**: `web/src/synergy-core.mjs:synergyFromPairs`
      (raw-sum `50 + pos*0.8 − fric*0.9` deleted); pinned by
      `tests/test_synergy_core.mjs` (22 assertions, run in-gate via
      `tests/test_synergy_core.py`) — `[60,100]` and `[80]` both score 80,
      6×80 == 1×80, no-pair pool is neutral "Awaiting Second Component"
- [x] Slots declare a required subsystem: custom-pool slots gained
      `subsystem` (4 defaults + per-slot selector over all packed labels;
      aux slots null); `getCandidatesForSlot` **boosts** exact-label matches
      to the front of the list (boost, not hard filter — v1 label noise never
      empties a dropdown); blueprint slots already declare theirs (§3.6)
- [x] Deterministic protocol matrix: `evaluatePair` intersects
      `labelsOf(a)/labelsOf(b)` (packed `compatibility` or corpus derive from
      `web/src/compatibility.js` COMPATIBILITY_RULES) plus the fixed
      `PROTOCOL_CLIENTS` pairings — unit-proven: pg-server × `psycopg-lite`
      pairs "PostgreSQL Compatible" at exactly +10 over baseline
- [x] Seeded RNG: mulberry32 in `blueprint-engine.mjs` (already replacing both
      `Math.random` sites of the old template/item pick) with **visible seed
      chip + reset button** next to Shuffle Blueprint; `?seed=` deep-links via
      App; same seed + goal + step ⇒ byte-identical stack (smoke §13 pins
      `completeStack` reproducibility; no `Math.random` left in any generation
      path — only Graph3D's decorative background dust remains, out of scope)
- [x] Same language alone never "High Synergy": sameLang weight 18 ⇒ 68 < 75,
      asserted directly on `PAIR_WEIGHTS` and on `evaluatePair` in
      `test_synergy_core.mjs` (lang + shared primitives still reaches High)

## Verification gates

- [x] `python3 -m unittest discover -s tests -p "test_*.py" -q` green: **102/102 OK**
      (W3 baseline 62 → +signal 13 → +history 11 → +tier 8 → +worker 6 → +search 7 →
      +topics 8 → +blueprints 7 → +synergy 1)
- [x] `npm run build` (3.10s) + `node smoke-test.mjs dist` exit **0** — smoke spans
      SQL, worker-parity, §11 snapshot/changelog, §12 topic-map, §13 blueprint/engine:
      `OK: packed decode, ranked search, edges, facets, Tier-2 merge, and fallback index consistent for 123,153 repos.`
- [x] `verify_catalog.py --base-dir web/public` exit **0** after every regen;
      Tier-2 `web/public/data/details` byte-untouched (`git status` clean — all local
      regens ran with `write_shards=False`)
- [x] Both workflow YAMLs parse (js-yaml): `backfill_123k.yml` + `deploy.yml`.
      Backfill needs **no topic-map edit** — it already runs `git add web/public`
      (ships `topic-map.json`) and `node web/smoke-test.mjs web/public` (so the new
      gates run in CI too)
- [x] README updated where behavior changes: Signal formula + term table + test pin,
      SQL Studio subset incl. mutation rejection, topic facet + topic cloud +
      Ecosystems/`topic-map.json`, History/Rising semantics (honest single-snapshot
      baseline), Inspire blueprints + `?seed=` reproducibility + mean-over-pairs synergy

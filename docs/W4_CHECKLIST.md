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

- [ ] Web Worker for filter+search: worker fetches packed+index itself, main posts the
      filter request, worker replies with ordered row ordinals (60 fps while filtering
      123k); parity gate: worker core module == current main-thread results on sample
      queries (shared pure module, unit-tested)
- [ ] Language facet groups the long tail: languages with <50 rows collapse into one
      `Other (1,858)` chip entry (rows keep their true language; facet+select only)
- [ ] Touch handlers on both canvases (galaxy + topic cloud of §E) — pointer events
- [ ] Discovery pills reset every facet they do not mention (set-then-clear, no stale filters)
- [ ] `?inspect=` prefers `owner/name`, falls back to bare name; URL writes `owner/name`
- [x] `pushed_at` guarded before `Date.parse` — done in W3 (modal footer); re-grep gate
      in smoke stays

## C. §3.4 Signal score

- [ ] Pack-time `signal` parallel array (0–100): documented arithmetic —
      `0.45·stars percentile + 0.25·push recency (decay 18mo) + 0.20·fork ratio
      percentile + 0.10·has quickstart/release` (exact terms frozen in README)
- [ ] `Signal` option in Sort select + minimum-signal slider
- [ ] Unit tests pin the formula (monotonicity, bounds, term contributions)
- [ ] README: formula section (auditable, no black box)

## D. §3.2 + §3.3 Star-delta trending & changelog

- [ ] `pipeline/` writes `web/public/history/<date>-stars.json` snapshot per rebuild
      (columnar `{id: [stars, forks]}`) + keeps the previous one (CI commits them;
      ~1–2 MB/yr budget)
- [ ] Rebuild diffs the last two snapshots → `web/public/changelog.json`
      (added/removed, top movers, label/domain moves from packed metadata)
- [ ] App: `changelog` tab rendering it + **"Rising this month"** shelf on Explorer
      (top star-delta over the snapshot window), modal **sparkline**, momentum badge
- [ ] Backfill workflow: commit history + print top movers in the PR body (workflow edit)
- [ ] Seeded now: first snapshot from the current packed rows so the next backfill diffs

## E. §3.5 Topic facets + Ecosystems

- [ ] Topic facet select + per-domain **topic cloud** (from `facets.json` topics)
- [ ] Pack-time **topic co-occurrence map** (`topic-map.json`: pair → count, top edges
      per topic) → new **Ecosystems** tab: topic nodes + co-occurrence links,
      click = filtered catalog
- [ ] Touch/pointer handling shared with galaxy (§B)
- [ ] Honest empty states locally (Tier-2 topics land via CI backfill; golden fixtures
      already prove the pipeline)

## F. §3.6 Stack Blueprints

- [ ] `web/src/blueprints.json`: grow the 4 hardcoded templates into a curated library
      per domain — role slots, required subsystem per slot, compat edges, seeds
- [ ] Build-time validation test: every `owner/name` named in a blueprint exists in
      the packed catalog (pytest against `web/public/catalog-packed.json`)
- [ ] Rule engine completes stacks from candidates matching slot constraints
      (deterministic, zero-LLM)

## G. §3.8 Synergy normalization (`InspirationGenerator.jsx`)

- [ ] Score = **mean over pairs** (2-slot and 6-slot comparable) — pin with unit test
- [ ] Slots declare a required subsystem; candidates filtered/boosted by it
- [ ] Deterministic protocol-compatibility matrix derived from `COMPATIBILITY_RULES`
      (Postgres-compatible ↔ pg drivers, OpenAI-compatible ↔ OpenAI clients …)
- [ ] Seeded RNG (mulberry32, seed visible/resettable) replaces `Math.random()` —
      same seed ⇒ same stack
- [ ] Same language alone never yields "High Synergy" (test)

## Verification gates

- [ ] `python3 -m unittest discover -s tests -p "test_*.py" -q` green (62 + new)
- [ ] `npm run build` + `node smoke-test.mjs dist` exit 0 (adds SQL + worker-parity +
      snapshot/changelog gates)
- [ ] `verify_catalog.py` exit 0 after each pack-time regen; Tier-2 shards untouched
- [ ] Both workflow YAMLs parse (D needs a backfill-workflow edit)
- [ ] README updated where behavior changes (signal formula, SQL subset, history)

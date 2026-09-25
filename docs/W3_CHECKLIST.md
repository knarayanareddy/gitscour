# W3 — Leverage: implementation checklist

Source: `docs/REMAINING_WORK.md` §2 (findings #7c/#7d/#8/#11/#12/#14, features 3.2–3.7).
Branch `arena/01a0d2cb-gitscour`. Standing rule: **zero LLM calls.** Predecessor: `docs/W2_CHECKLIST.md` (32/33, pushed `c3e8f19`).

**Status: IN PROGRESS — search + builders landed; Graph3D/Neighbors/activity/license/facet UI pending.**

## Baseline (measured on the shipped 123,153-row catalog before the change)

| Metric | Measured |
|---|---|
| One full search scan (per keystroke, no debounce) | **143.7 ms** (accept: <5 ms) |
| `'simd'` hits (substring over name/owner/hook/lang/domain/subsystem) | **48** (142 rows carry the primitive) |
| `'sql vector'` hits | **1** (review measured the same) |
| `'raft'` hits | 654 (includes *draft/craft* substring false positives) |
| `catalog-packed.json` gzip | **7.25 MB** (README/header claim *3.2 MB* — false) |
| Tier-2 topics coverage (shipped shards) | 0% (W2 §1.4 writes them from the next backfill) |
| General\\* subsystem fallback share (v1 labels) | 74.2% (edges must not clique on it) |

## Execution order

2.3 → 2.1 → 2.2 → **commit search** → 2.4 → 2.5 → **commit graph** → 2.6 → 2.7 → 2.8 → gates.

## 2.3 Search runtime hygiene (finding #8, cheap)

- [x] Memoize the per-repo search corpus **once** at unpack (`searchCorpus` built in the
      unpack map; substring fallback no longer rebuilds per keystroke)
- [x] Debounce input 120 ms (`debouncedQuery` state; URL sync stays on the raw query)
- *Accept:* indexed query path measures **0.09–1.06 ms** median (gates assert <5 ms)

## 2.1 Pack-time inverted index + BM25-lite ranking (finding #8, P1)

- [x] `write_artifacts` (shared by rebuild **and** reclassify) emits `web/public/search-index.json`
      (`pipeline/search_index.py`): 142,546 tokens / 1,415,241 postings / 14.80 MB raw /
      **3.79 MB gzip**; flat pairs `[ord0_abs, code, delta, code…]`, `code=(tf<<10)|field-mask`
- [x] Client query path: field-weighted BM25-lite in `web/src/search-core.mjs`
      (`idf = ln(1+N/df)`, `tf/(1+tf)`, weights name 5 > owner 4 > subsystem 3 > topics 2.5 >
       primitives 2 > compatibility 1.5 > domain 1.5 > hook 1 > language 0.5 >
       license 0.5; **match-count-first** ordering + `1+0.5*(matched-1)` bonus;
      tie-break `ln(1+stars)` then ordinal; empty query keeps stars-desc)
- [x] Backfill regenerates the index automatically — it flows through `write_artifacts`
      (rebuild + reclassify); confirmed `backfill_123k.yml` needs no edit (pytest step,
      rebuild, re-score, verify, `node web/smoke-test.mjs web/public` all in place)
- *Accept:* **947/142/157 hits for `'sql vector'`/`'simd'`/`'raft'` at 1.06/0.20/0.10 ms**,
  duckdb top-3 all `duckdb/*`, 7/10 of the `'sql vector'` top-10 mention both tokens

## 2.2 Search what you already know (finding #8)

- [x] Searchable fields include `primitives`, `license`, `compatibility`, `topics`
      (all 10 fields are indexed; the memoized fallback corpus covers them too)
- [x] `web/smoke-test.mjs` imports `src/search-core.mjs` (the shipped code — no mirror)
      and asserts hits + latency + relevance + determinism + index shape; thresholds:
      `'sql vector'` ≥20 (947), `'simd'` ≥100 (142), `'raft'` ≥150 (157 — exact tokens,
      the old substring's 654 included *draft/craft*), each <5 ms median
- [x] `tests/test_search_index.py` (13 tests): keep-rules (name df==1 kept, body df==1
      dropped, stop-word cap), delta roundtrip + ascending order, df↔postings agreement,
      determinism, match-count-first ranking, edges invariants incl. General* = fallback
      only, facet recount — suite **50/50 green**

## 2.4 Pack-time kNN edge list (findings #7c/#7d + §2.E)

- [x] `write_artifacts` also emits `web/public/edges.json` (`pipeline/neighbors.py`):
      top-k=8 weighted Jaccard over `(topics, subsystem, primitives, compatibility)`
      **+ language/artifact seed groups** (weight 1 each); per-row candidate counting with
      `MAX_FEAT_DF=1500`, `CAND_CAP=64` (the eager all-pairs version OOM'd at 123k rows)
- [x] General\\* subsystem contributes **0** similarity (unit-tested); window fallback (0.1,
      i±8) guarantees ≥1 edge — builder report: 985,224 edges, **min degree 8**,
      fallback 74.85% locally (empty topics until the CI backfill lands them),
      top bucket **19.7% ≤25%**
- [ ] `Graph3DExplorer.jsx` consumes `edges.json` (client compatibility derivation stays as
      fallback); nodes may still be sampled for layout, but links come from real data
- *Accept:* every node has ≥1 edge ✓ (min degree 8); no bucket >25% ✓ (19.7%)

## 2.5 "Similar repositories" Neighbors tab (feature 3.4)

- [ ] New modal tab: top-5 neighbours from `edges.json`, template reason strings computed
      from the shared sets at render time (`shares subsystem X + primitive Y`), deterministic

## 2.6 Activity & freshness intelligence (features 3.2 + finding #11)

- [ ] GraphQL adds `isArchived`, `createdAt` (harvest output), pack derives
      **Active / Idle / Archived** status + recently-pushed sort + dormant filter
- [ ] **Maturity v2** uses `pushed_at`/`forks` — a 10-year-dormant repo stops reading
      "Production Battle-Tested"
- [ ] Remove fabricated `pushed_at: "2026-09-01T00:00:00Z"` fallback (write `null`, UI guards
      the date parse)
- *Design note:* activity travels as parallel pack-time arrays (not a row-schema change —
      row arity stays 12|13 with `domain_margin` @ 12)

## 2.7 License normalization + working facet (finding #12, feature 3.7)

- [ ] Pack maps junk (`Open Source`, `Unknown`, `NOASSERTION`) → `Unknown`; per-row
      `license_tier ∈ {permissive, copyleft, source-available, unknown}` from the existing
      `classify_license_freedom` rules (parallel arrays / client derivation, no row churn)
- [ ] UI: `setSelectedLicenseTier` wired to a real control incl. permissive-only filter;
      no raw `NOASSERTION` badges rendered

## 2.8 Facet counts + badge truth (feature 3.11, finding #14)

- [x] Pack-time `facets.json` written (`pipeline/facets.py`): domains/subsystems(+domain
      parent)/artifacts/languages/topics(top 60)/primitives/compatibility/licenses;
      smoke recounts every domain count from the rows — exact truth ✓
- [ ] Chips UI (`Databases (3,800)`) — with the license-tier facet in §2.7
- [ ] Fix the *3.2 MB gzip* claim in README + header badge → measured truth (packed gzip
      7.25 MB before W3; re-measure with the final artifact set and state it honestly)

## Verification gates

- [x] All suites green: **50 tests** (37 existing + 13 new)
- [x] `web/smoke-test.mjs`: unpack (arity 12..15, topics/compat tail) + search gates +
      edges invariants + facet recount + Tier-2 merge + fallback — **OK for 123,153 repos**
- [x] `npm run build` + smoke pass; latency asserted with `performance.now()` (<5 ms,
      measured 0.09–1.06 ms medians)
- [x] `verify_catalog.py` exit 0 on regenerated artifacts (0 stray/misplaced/missing);
      Tier-2 shard bytes untouched locally (`write_artifacts(write_shards=False)`)
- [x] Size budget: search-index 14.80 MB raw / **3.79 MB gzip**, edges 11.96 MB /
      0.81 MB gzip, facets 0.02 MB — all new files ~27 MB of the 128 MB budget
- [x] Both workflow YAMLs parse (`backfill_123k.yml`, `deploy.yml`); no workflow edit needed
      (index/edges/facets regenerate inside the existing rebuild + re-score steps)

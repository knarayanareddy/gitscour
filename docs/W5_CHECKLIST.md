# W5 — Cross-cutting ops & guardrails: implementation checklist

Source: `docs/REMAINING_WORK.md` §4 (O.1–O.7, P2–P3 hygiene) + §5 (zero-LLM guardrail).
Branch `arena/01a0d2cb-gitscour`, predecessor `docs/W4_CHECKLIST.md` (38/38, tip `1879841`).
Standing rule: **zero LLM calls at runtime** — everything deterministic, rule-based, auditable;
§5 turns that standing rule into an *enforced* CI gate.

**Status: NOT STARTED.**

## Baseline (measured 2026-09-25 before starting)

| Metric | Measured |
|---|---|
| Checkpoint resume (O.1) | Manifest compares **full window JSON incl. volatile `count`** (`harvest_enumerate.py` `pending = [w … if json.dumps(w) not in ckpt.done]`) → cross-run resume silently misses when probe counts drift; `Checkpoint.seen` starts empty (never scans the output file) → crash-resume re-appends duplicate records. `done` *is* reloaded from the manifest ✓ |
| `stats.json` → PR (O.2) | Writer exists: `harvest/stats.json` = `{started, elapsed_s, windows_planned, windows_done, windows_failed, windows_truncated, universe_estimate}` — **0 references** in `backfill_123k.yml` (PR body assembles only the changelog `Star movers` section, line 155) |
| Per-run rewrite size (O.3) | Six **single-line** JSONs rewritten per backfill (`wc -l` = 0): `catalog-index` 63 MB + `repos.json` 63 MB + `catalog-packed` 23 MB + `search-index` 15 MB + `edges` 12 MB + `data/details/*` 165 MB ≈ **341 MB/run** into git; whole repo pack today = 67 MB |
| `repos.json` twin (O.4) | `cmp repos.json catalog-index.json` → **IDENTICAL** (63 MB); live readers = `verify_catalog` parity loop (line 140), `rebuild_catalog` writer loop (line 514) + size stat (line 640), `README:158` table, plus legacy harvesters only |
| Python test lane (O.5) | **Already wired** at R0 (`05a7ef9`): both workflows run `pip install pytest` + `python -m pytest tests/ -q`; last 5 `Deploy to GitHub Pages` runs green (all W4 pushes); pytest not installable locally (PEP-668) — local gate stays `unittest`, CI gate is pytest |
| Legacy harvesters (O.6) | 9 files (`ingest.py` + `harvest_scale, backfill_worker, scale_50k, pack_index, shard_manager, harvest_20k, harvest_phase1, fast_harvest`): **zero active imports**; backfill uses only `harvest_enumerate/reconcile/rebuild/reclassify/merge_seed/verify`; but `README:109` still tells users to run `python3 pipeline/ingest.py`, `README:158` already labels two of them "kept for reference" |
| README claims (O.7) | "sub-5ms" exists only in *historical* review docs — README makes **no measured search claim**; smoke measures identity 6.2–7.4 ms / ranked `'sql vector'` 3.1–3.8 ms but **asserts no time bound**; `README:135` calls reconcile *"optional"* while backfill runs it (line 67, R1.6); `docs/AI_TOOLS_METHODOLOGY_BLUEPRINT.md`: **0** no-LLM cross-references |
| Zero-LLM guard (§5) | **0** guard steps in either workflow; SDK-call pattern baseline over `pipeline/ + web/src/ + tests/` = **empty** (static lexicons like `openai` in `taxonomy_engine.py`/`compatibility.js` stay allowed — call patterns deliberately do not match them) |

## Execution order (sequential, one commit per chunk)

**A. O.1 checkpoint resume** → **B. O.2 stats in PR body** → **C. O.5 verified + §5 zero-LLM
CI guard** → **D. O.4 drop `repos.json`** → **E. O.3 line-oriented big-JSON writers** →
**F. O.6 legacy archive** → **G. O.7 README overclaims audit** → final gates.

Order rationale: A–C are independent correctness/enforcement wins; D removes 63 MB/run *before*
E rewrites the remaining writers (single README/verify edit trail); F is a pure `git mv`; G last
so documentation quotes final, measured behavior.

**Scope decisions (recorded up front):**
- O.3 *choice:* **line-oriented serialization + alias removal**, not "artifacts outside git" —
  GitHub Pages deploys straight from the repo checkout, so tracked artifacts are load-bearing;
  per-row/per-posting newlines give git real deltas without changing the serving model.
- O.6 *choice:* **move to `legacy/` with a README note**, not delete — preserves the
  `scale_50k` salted-hash footgun doc and the harvest-era reference code.

---

## A. O.1 — Checkpoint manifest keyed by clause only

- [x] Manifest identity = **clause only**: new `clause_key()`/`CLAUSE_KEYS`
      (`star_lo/star_hi/fork_lo/fork_hi`) — `complete()` writes the clause-keyed
      line, `pending` compares clause keys, loader JSON-parses every line and
      **re-keys legacy full-dict lines** (unparseable lines skipped: can only
      re-harvest, never lose); `count`/`truncated` no longer part of identity
- [x] `Checkpoint.seen` populated at startup by streaming the output JSONL once
      through the same `key()` the writer dedupes with (malformed lines skipped);
      a re-delivered window's records append **0** duplicates
- [x] `tests/test_checkpoint.py` — **13 tests**: drifted count (987→1000 +
      `truncated`) resumes with only the unfinished clause pending; legacy,
      clause-only, and mixed manifest lines dedupe to one `done`; unfinished
      window still pending after restart; corrupt manifest/output lines
      survive; `complete()` line carries exactly the 4 clause fields (no
      `count`/`truncated`); case-insensitive cross-instance dedupe; flush
      guarantees. Suite → **115/115 OK**
- *Accept:* verified live: same clause + new count ⇒ only the never-completed
  window re-harvested; restart over existing output appended **0** duplicate
  `owner/name` lines.

## B. O.2 — Surface `stats.json` in the backfill PR body

- [x] PR body gains `## Harvest coverage`: windows done/planned, failed,
      truncated, universe estimate, elapsed — parsed from `harvest/stats.json`
      by a heredoc+python block mirroring the `Star movers` section (inserted
      between the body and movers)
- [x] Missing `stats.json` ⇒ honest one-liner (`_Harvest stats unavailable…_`);
      **verified against the real post-YAML script**: extracted the step's `run`
      via js-yaml, sliced the body-assembly segment, executed it under
      `set -euo pipefail` with three fixtures — full-coverage (123/123 line +
      sweep verdict), warning (1 failed/1 truncated ⇒ Warning line), and
      no-stats (fallback line). Heredoc terminators land at col 0 after YAML
      dedent; both workflow YAMLs parse
- *Accept:* every backfill PR shows coverage numbers even when the run is green; a run with
  `windows_failed > 0` is impossible to ship anyway (harvester exits non-zero) — the PR makes
  truncation/coverage *visible*, not just gated.

## C. O.5 verified + §5 — Zero-LLM guardrail in CI

- [x] O.5 evidence: both workflows run `pytest tests/ -q` (R0 `05a7ef9`, deploy.yml
      lines 36-40) covering R0.3 harvest suite + golden-set — recent runs all
      **success**: `36348153753` (W5 B), `36347432988` (W5 A), `36182965801`
      (W5 spin-up). No new job needed; the suite itself now also carries the
      §5 scanner (next items)
- [x] `pipeline/check_zero_llm.py`: stdlib scanner over `pipeline/ + web/src/ + tests/`
      (`*.py,*.js,*.jsx,*.mjs`, skips `__pycache__/legacy/…`) with **4 call-form
      rules** — SDK import/require lines (`openai|anthropic|langchain|
      google.generativeai`), `OpenAI(`/`Anthropic(` constructors, `llm_api(`,
      provider sites (`api.openai.com`, `api.anthropic.com`,
      `generativelanguage.`, `generativeai.googleapis.com`). Lexicons pass **by
      pattern design**: measured baseline — `openai`/`gpt`/`langchain` occur only
      as data (taxonomy, compat rules, golden fixtures) and never match call
      forms; bare-word rules (`anthropic`, `gpt`) were deliberately not used
      because lexicons may legitimately name them. Self-scan clean (51 files)
- [x] Wired as a `Zero-LLM guardrail` step in **both** workflows directly after
      `verify_catalog` (deploy.yml:54, backfill_123k.yml:104) + covered by
      `tests/test_zero_llm.py` — **14 tests**: clean-tree + default-CLI pass,
      planted fixture detected (`sdk-import`/`constructor`/`site`/`require`,
      correct line numbers, commented-out calls flagged on purpose),
      lexicon-label/prose/regex fixtures pass, subprocess exit codes 1/0
- *Accept:* verified live — `pipeline/check_zero_llm.py` on a planted
      `import openai` file exits **1** with `[…sdk-import]` in the report; clean
      tree exits **0**; suite **129/129**; both workflow YAMLs parse.

## D. O.4 — Drop the `repos.json` 63 MB twin

- [x] Writer: emit loop now writes `catalog-index.json` only (docs say "three
      artefacts"); size stat counts the fallback index **once** (was `2 *` the
      twin); `git rm web/public/repos.json` — deleted blob measured **65.3 MB (63 MiB)**
      (byte-identical to the index, `cmp` at baseline) ⇒ −63 MB every backfill run
- [x] Reader: `verify_catalog` parity loop covers `catalog-index.json` alone
      (`Tier-1 fallback catalog-index.json: 123,153 records, ids identical vs
      packed`), docstrings updated ("three interdependent files"); README
      runbook + artefact table no longer list the twin; `generate_seed` refusal
      text names `(catalog-index.json / shards)` and its guard comment keeps the
      review-#6 history without the removed path; `deploy.yml` historical comment
      notes the W5 O.4 removal
- [x] Regression: `tests/test_repos_alias.py` — 4 pins: file absent;
      `verify_catalog` subprocess exit 0 over `catalog-index.json` alone; grep-pin
      over `pipeline/ + web/src/ + tests/` code finds no reference outside the
      5 legacy-bound files (allowlist == actual mentions, so W5 F must empty it);
      suppression is a **visible `# twin-name-ok` marker** on explanatory lines +
      self-exemption for the pin test itself; `test_verify_catalog` fixture stops
      writing the removed twin (it is not part of the contract)
- *Accept:* **−63 MB/run**; `verify_catalog` exit 0; build 2.91s + smoke exit 0;
      suite **133/133**; both YAMLs parse; zero-LLM scanner still clean.

## E. O.3 — Line-oriented serialization for the big JSONs

- [x] New `pipeline/linejson.py` (`dumps`/`write`, stdlib-only): top-level
      arrays → one compact element per line; top-level objects → one
      `"key": value` entry per line, list values one element per line, other
      values inline; same compact separators + ASCII escaping as the old
      `json.dump(separators=(",",":"))`, plus trailing newline. Wired into all
      five targets: `catalog-index` (per-row), `catalog-packed` `rows` +
      `activity`/`license_tiers`/`signal` (per-element; label maps inline),
      `search-index` (per token/postings line), `edges` (per neighbor list),
      Tier-2 shards (per-record, **int keys stringified like `json.dump`
      does** — caught by the reclassify apply suite, now pinned). Existing
      files stay old-format until the next CI backfill (which rewrites them
      anyway), so both formats coexist parse-cleanly; readers untouched
- [x] Delta evidence, measured on a 5,000-row fixture: one-row change ⇒
      `git diff -U0` = **295 B** (0.1% of file) vs legacy **927,941 B**
      (~200% of file — the whole blob twice) ⇒ **3,146× smaller**; the
      line-oriented diff contains exactly the one changed row (1 add/1 del),
      unit-asserted
- [x] `tests/test_linejson.py` — **15 pins**: round-trip equality for all five
      layouts (vs legacy writer too), int-key shards, byte-determinism across
      writes, trailing newline, one-record-per-line (50 rows ⇒ 52 lines),
      one-row-change touches exactly one line, 12/13/15-field arity, and the
      git-accept trio (line-oriented diff = the row only; legacy diff ≈ whole
      file; ≥20× ratio). Integration: `reclassify --allow-churn` apply round-trips
      real shard writes through the new writer and every shard re-parses
- *Accept:* double-write byte-identical ✓ (unit); readers unchanged ✓ (verify
  0, smoke exit 0 over the still-old-format artifacts, 148/148 tests); monthly
  rewrites diff at row granularity once CI emits the new format, on top of
  D's −63 MB

## F. O.6 — Legacy harvester archive

- [x] `git mv` done — `legacy/` now holds exactly the nine files (`ingest`,
      `harvest_scale`, `backfill_worker`, `scale_50k`, `pack_index`,
      `shard_manager`, `harvest_20k`, `harvest_phase1`, `fast_harvest`) +
      `legacy/README.md`: per-file "what it did / why frozen" table, the
      salted-hash footgun spelled out (scale_50k's `abs(hash(url))` ids at
      lines 29/84/107/130/155 re-salt per process and would break every
      Tier-2 lookup — file **kept, not deleted**, warning also still in the
      main README), and the note that the archive preserves the `raw`-dict
      contract `harvest_enumerate` documents. `pipeline/` down to its 16 live
      scripts; moved files untouched (pure `git mv`)
- [x] README runbook: step 3 now runs `python3 pipeline/harvest_enumerate.py`
      with explicit relative `--output/--manifest` (mkdirs its parent), with a
      note pointing the old single-query `ingest.py` at `legacy/`; artefact
      table rows (former lines 157–158) now read `legacy/…` + link
      `legacy/README.md`. Grep: **0** `python3 pipeline/<archived>.py`
      instructions; every `python3 pipeline/…` the runbook names (generate_seed,
      harvest_enumerate, rebuild_catalog, verify_catalog) exists in-tree
- [x] Grep gate = `tests/test_legacy_archive.py` (5 pins): legacy/ contents ==
      the nine + README exactly; none of the nine under `pipeline/`; code +
      workflow scan finds **only `legacy/<file>` pointers** (strip them ⇒ zero
      remainder) and **zero imports** of archived modules — this forced
      `legacy/`-prefix rewrites of 6 docstring/comment mentions
      (harvest_enumerate ×3, rebuild_catalog ×3) + the `deploy.yml` comment;
      README instruction + table assertions. `LEGACY_BOUND` in
      `tests/test_repos_alias.py` emptied to `set()` in the same commit
      (allowlist == actual == ∅, grep-pin now absolute). CI unaffected:
      `check_zero_llm` already excludes `legacy/` (SKIP_DIRS) — 46 files clean
- *Accept:* `pipeline/` = 16 live files, none archived ✓; runbook commands all
  resolve to existing live scripts ✓; **153/153** tests, verify 0
  (123,153 repos), both YAMLs parse, build 4.12s + smoke exit 0.

## G. O.7 — README overclaims audit

- [x] `web/smoke-test.mjs`: `RANK_CEILING_MS = 50` hard-fail ceiling per ranked
      query (~13× the worst measured 3.8 ms, ~38× the 0.1–1.3 ms seen in this
      sandbox) — replaces the old tight `5` ms budget that could flake under CI
      variance; per-query medians still measured (`performance.now()`, median
      of 5, warm-up + determinism check kept) and a new output line reports
      the ceiling next to them. README gains a **Search latency** bullet:
      0.1–3.8 ms median per query **with the `web/smoke-test.mjs` citation**
      (reports medians every build, hard-fails >50 ms) — no unqualified
      "sub-5ms" anywhere in README (grep: 0); the blueprint's "Sub-5ms" target
      is now qualified with the same measured numbers + gate link
- [x] README reconcile paragraph rewritten: `reconcile_stale_rows.py` **runs
      automatically in the monthly backfill CI** (`backfill_123k.yml`, step
      "Reconcile stale rows", workflow lines 67→76) immediately **before**
      `rebuild_catalog.py` (R1.6); local pre-pass framing kept as secondary —
      "optional" is gone (grep: 0)
- [x] `docs/AI_TOOLS_METHODOLOGY_BLUEPRINT.md`: (§1.2) new **Zero-LLM
      constraint (standing)** bullet — zero model calls, deterministic,
      enforced by `pipeline/check_zero_llm.py`, "applies to any future phase
      built from this blueprint; **if that phase proceeds**, its agent
      personas structure authoring only, never runtime behavior"; (§4) a
      matching blockquote standing-constraint header directly above the five
      personas
- *Accept:* README performance claims are gate-linked: Search latency bullet →
  smoke ceiling/medians ✓; faceted filtering / SQL Studio / history bullets →
  smoke assertions ✓; zero-LLM → `check_zero_llm` CI ✓. Gates: **153/153**,
  smoke exit 0 (with new ceiling line), zero-LLM 46 files clean, verify 0,
  both YAMLs parse.

---

## Verification gates

- [x] Unittest green: **153/153** locally (`Ran 153 tests ... OK`) = W4's 102
      + 51 pins added across A–G (checkpoint manifest, zero-LLM scanner,
      repos-removal ×4, line-oriented writer ×15, legacy archive ×5, …);
      the CI `pytest` lane (deploy.yml:40) is green on the same tree — runs
      36390293040 (E), 36411327773 (F), 36411992148 (G)
- [x] `npm run build` (4.50 s) + `node smoke-test.mjs dist` **exit 0**, incl.
      the new search-time assertion (medians 0.09–0.77 ms, ceiling line
      printed). Readers parse the line-oriented JSONs identically — proven by
      re-encoding all 5 E targets (14 files) into a temp copy with
      `pipeline/linejson.py` (byte-roundtrip parse equality per file;
      `catalog-index.json` = 123,155 lines = one per row + brackets) and
      running both readers against it: `verify --base-dir` **exit 0** and full
      smoke **exit 0** on the line-oriented set (vs the old-format originals
      also exit 0) — live artifacts untouched, per the migration decision
- [x] `verify_catalog.py --base-dir web/public` **exit 0** after D/E
      (`OK: catalog artefacts are internally consistent (123,153 repositories)`),
      no `repos.json` present or referenced; Tier-2 content preserved — no local
      regen happened outside `/tmp` fixtures, so the `write_shards=False` policy
      is intact (the only shard rewrite path exercised was E's line-format
      migration, and only in temp copies with parse-equality asserted)
- [x] Both YAMLs parse (js-yaml): `backfill_123k.yml` + `deploy.yml` ✓.
      Pytest-lane evidence recorded — Deploy run **36411992148** (G) steps:
      Install Test Runner / **Unit Tests (no network)** / **Verify Catalog
      Integrity** / **Zero-LLM guardrail** / **Smoke Test Built Artefacts** all
      `success` (same lane green in E-run 36390293040 and F-run 36411327773)
- [x] README + blueprint docs match shipped behavior: reconcile runbook now
      states the monthly CI ordering ("runs automatically in the monthly
      backfill CI … before rebuild_catalog"), artefact table rows point at
      `legacy/` + `legacy/README.md`, search numbers measured + smoke-cited
      (0.1–3.8 ms, README + blueprint), and a new README CI bullet documents
      the zero-LLM enforcement lane (`check_zero_llm` fails the build) alongside
      the blueprint's §1.2 standing-constraint bullet + §4 blockquote

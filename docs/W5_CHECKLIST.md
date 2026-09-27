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

- [ ] Writers emit **one row/posting/record per line** while staying valid JSON and
      byte-deterministic (same input ⇒ identical bytes; `json.load`/`JSON.parse` readers
      untouched): `catalog-index.json` (per-row), `catalog-packed.json` (per-row in `rows`
      + per-line parallel arrays as needed), `search-index.json`, `edges.json`, Tier-2
      `data/details/*.json` (per-record)
- [ ] Delta evidence: synthetic 1-row change → `git diff --numstat` line count vs the
      single-line baseline recorded in this checklist (expect: touched-row lines only)
- [ ] Unit pins: round-trip parse equality vs current content, determinism (double-write
      byte-identical), arity guards preserved (12..15 fields)
- *Accept:* re-run writer twice ⇒ byte-identical; readers/smoke/verify unchanged-green;
  monthly rewrites now diff at row granularity (plus −63 MB from D) instead of ~341 MB of
  un-diffable blobs.

## F. O.6 — Legacy harvester archive

- [ ] `git mv` the 9 reference-only files to `legacy/` + `legacy/README.md`: what each did,
      why it is frozen, pointer to the salted-hash footgun warning in `scale_50k` (kept, not
      deleted)
- [ ] README runbook no longer instructs `python3 pipeline/ingest.py` (line 109) — point at
      `pipeline/harvest_enumerate.py` (the live path); legacy table row (line 158) updated to
      `legacy/`
- [ ] Grep gate: no reference outside `legacy/` + docs; tests/CI unaffected (0 imports today)
- *Accept:* `pipeline/` contains only live code; the runbook executes as written.

## G. O.7 — README overclaims audit

- [ ] Search performance: smoke **asserts a bound** on ranked queries (hard-fail ceiling far
      above the measured 3.1–3.8 ms so CI variance never flakes; measured value reported) and
      README states the measured numbers with the smoke citation — no unqualified "sub-5ms"
- [ ] `README:135`: reconcile is no longer "optional" — it runs in the monthly backfill CI
      before `rebuild_catalog` (R1.6); wording reflects the workflow
- [ ] `docs/AI_TOOLS_METHODOLOGY_BLUEPRINT.md`: explicit cross-reference that the standing
      zero-LLM constraint applies to any future phase built from it (feature-detect wording
      per §4: "if that phase proceeds")
- *Accept:* every performance/behavior claim in README is either smoke-asserted or linked to
  the gate that keeps it true.

---

## Verification gates

- [ ] `python3 -m unittest discover -s tests -p "test_*.py" -q` green (W4 = 102; +checkpoint,
      zero-LLM scanner, line-oriented writer, repos-removal pins)
- [ ] `npm run build` + `node smoke-test.mjs dist` exit 0 (incl. new search-time assertion;
      readers of the line-oriented JSONs parse identically)
- [ ] `verify_catalog.py --base-dir web/public` exit 0 **after D/E** (no `repos.json`);
      Tier-2 content preserved — regens keep `write_shards=False` unless E deliberately
      rewrites shard *format* with byte-roundtrip proof
- [ ] Both workflow YAMLs parse (js-yaml): `backfill_123k.yml` + `deploy.yml` with the new
      stats-PR-body, zero-LLM-guard steps; `pytest` lane evidence recorded
- [ ] README (+ AI blueprint) updated where behavior/documentation changed: reconcile runbook,
      legacy table, measured search numbers, zero-LLM enforcement note

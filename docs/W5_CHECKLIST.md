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

- [ ] Manifest identity = **clause only** (`star_lo/star_hi/fork_lo/fork_hi`): drop `count`
      (and any other volatile probe output) from the comparison key; `complete()` writes the
      clause-keyed line; loader accepts **legacy full-dict lines** (re-key on read) so an
      interrupted CI run resumes across the upgrade
- [ ] `Checkpoint.seen` populated at startup by streaming the output JSONL once
      (owner/name keys, same `key()` the writer dedupes on) → crash-resume never re-appends
- [ ] `tests/test_checkpoint.py`: interrupted run resumes exactly with a *changed* probe
      count; duplicate records across instances dedupe; legacy manifest lines still match;
      failed windows stay pending (never checkpointed)
- *Accept:* same clause + new count ⇒ zero re-harvest of completed windows; re-running over
  an existing output appends **0** duplicate `owner/name` lines.

## B. O.2 — Surface `stats.json` in the backfill PR body

- [ ] PR body gains `## Harvest coverage`: windows done/planned, **failed**, **truncated**,
      universe estimate, elapsed — parsed from `harvest/stats.json` by the same
      heredoc+python pattern as the existing `Star movers` section
- [ ] Missing `stats.json` (manual/aborted runs) ⇒ honest one-liner, never a broken body;
      YAML + heredoc dedent verified by parse before push
- *Accept:* every backfill PR shows coverage numbers even when the run is green; a run with
  `windows_failed > 0` is impossible to ship anyway (harvester exits non-zero) — the PR makes
  truncation/coverage *visible*, not just gated.

## C. O.5 verified + §5 — Zero-LLM guardrail in CI

- [ ] O.5 evidence tick: both workflows run `pytest tests/ -q` (R0 `05a7ef9`), covering
      R0.3 harvest suite + golden-set (`test_taxonomy_golden.py`); last green runs recorded
      below — no new job needed
- [ ] `pipeline/check_zero_llm.py`: stdlib scanner over `pipeline/ + web/src/ + tests/`
      (`*.py,*.js,*.jsx,*.mjs`) for SDK **call/import** patterns —
      `import openai|from openai|anthropic|api.openai.com|api.anthropic.com|generativelanguage|google.generativeai|llm_api(|OpenAI(` etc.;
      static lexicons/comments/data are out of scope *by pattern design* (baseline grep
      today = empty, lexicon strings do not match)
- [ ] Wired as a step in **both** workflows beside `verify_catalog` + covered by
      `tests/test_zero_llm.py` (scanner finds its own planted fixture, clean tree passes)
- *Accept:* adding `import openai` to any pipeline file fails CI in both workflows — the
  constraint is *enforced*, not just documented.

## D. O.4 — Drop the `repos.json` 63 MB twin

- [ ] Writer: remove `repos.json` from the `rebuild_catalog` emit loop (line 514) + size
      stat (line 640); delete `web/public/repos.json`
- [ ] Reader: drop from `verify_catalog` parity loop (line 140) + docstring item 2;
      README table row (line 158) and `generate_seed` guard text updated to say the alias is
      gone; `--help`/warnings no longer name it as a live file
- [ ] Regression: unittest asserts the file is absent and parity still passes over
      `catalog-index.json` alone; no code path outside `legacy/` references it (grep-pinned)
- *Accept:* −63 MB per backfill run immediately; `verify_catalog` exit 0; deploy smoke green.

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

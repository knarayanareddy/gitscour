# W2 — Correctness: implementation checklist

Source: `docs/REMAINING_WORK.md` §1 (review findings #3/#5/#4/#10/#6b/#13, features 3.5/3.7).
Branch `arena/01a0d2cb-gitscour`. Standing rule: **zero LLM calls.**

**Status: IMPLEMENTED — see Evidence below.** One box (Application < 50%) is verified
by the *backfill CI* re-score, not locally: committed shards predate §1.4 and carry no
topics, so local re-scoring is the documented worst case.

## Baseline (v1 labels on live 123,153 rows, measured before the change)

| Metric | v1 |
|---|---|
| Other / General | 23.1% |
| Operating Systems & Low-Level | **18.4%** (inflated by substring `os`⊂repository bug) |
| Application / Service artifact | **70.7%** |
| General\* subsystem fallback | **74.2%** |
| hooks > 90 chars | 0 (safe to gate) |
| row arity | 12 fields (will become 12-or-13) |

## 1.1 Taxonomy v2 — token scoring + margins (finding #3, P0)

- [x] Compiled keyword patterns: `(?<![a-z0-9])` + flexible interior separators
      (`space/-/_/./` interchangeable) + letter-terminated look-ahead (digits allowed →
      `arm` matches `arm64`, `oauth` matches `oauth2`; `os` cannot match `repository`,
      `ai` cannot match `rails`, `sql` cannot match `graphql`)
- [x] Topic hits scored against a joined topic string (+3 domain / +4 subsystem),
      corpus hits +1 — same weights as v1, token-precise matching
- [x] Margin rule: winner needs `best ≥ 3 AND best − second ≥ 2`, else `Other / General`
- [x] Deterministic tie order `(score, topic-hits, alphabet)` — kills OS's dict-order bias
- [x] Subsystem computed only under the *accepted* domain; `General …` fallback format
      unchanged (keeps existing fallback labels stable); rejected → `General Components`
- [x] Lexicon gap fills: Web += `angular, rails, django, laravel, spring-boot`;
      Cloud += `observability, web-server, reverse-proxy, load-balancer`;
      Networking += `message-queue`; Databases += `lakehouse`
- [x] `classify_domain_and_subsystem` returns `(domain, subsystem, margin)`; margin
      capped 0–9, emitted as `domain_margin` (row[12], schema 12-or-13)

## 1.2 Artifact classifier v2 — scored rules (finding #13, P2)

- [x] Curated-list early returns kept (high precision: name-anchored regexes + topic tags)
- [x] Weighted evidence buckets with fixed priority order:
      Template (+6 name/+3 desc) · CLI (+6 name token `cli|tui`, +4 `command line tool`, …) ·
      Library (+4 `library|sdk|binding`, +3 `client|driver|wrapper`) ·
      Engine **demoted** (+4 `daemon`, +3 `broker`, +2 `engine|server`, +1 `database|datastore`) ·
      Framework (+6 name/+5 desc) · Application = 0 baseline
- [x] Exact-token only: `redis-client` → **Library / SDK**, `query engine library` → **Library / SDK**
- [ ] Application/Service share drops below 50% on live re-score

## 1.3 reclassify_catalog.py (finding #5, P1)

- [x] `rebuild_catalog.py` refactored into importable single-writer units:
      `attach_deep`, `finalize_records`, `write_artifacts` (rebuild `main()` behavior unchanged)
- [x] New `pipeline/reclassify_catalog.py`: attach Tier-2 (full descriptions, topics) →
      re-run v2 classifiers → swap labels in `keywords` (preserving topic entries) →
      regenerate **template** beginner_intel only (curated cards untouched) →
      finalize → write all four artefacts through the shared writer
- [x] `--dry-run` prints churn histogram: per-domain stayed/out/in, top transitions,
      margin distribution, changed-% for domain/subsystem/artifact
- [x] Live run fails (exit 2) if domain churn > `--max-churn-pct` (default 20)
      without `--allow-churn`; `--report-out` writes machine-readable report
- [x] Wired into `backfill_123k.yml` after rebuild, with report referenced in the PR body
- [x] **Live application of churn happens in backfill CI** (310 MB artefact regeneration is
      a CI/PR concern — matches the "reviewable backfill" design); local dry-run histogram
      captured below

## 1.4 Store topics going forward

- [x] Shard writer emits `topics[:8]`; `attach_deep` re-attaches stored topics
      (fill-if-empty so fresher harvest topics win); reclassify round-trips them losslessly

## 1.5 Golden-set regression harness (feature 3.5)

- [x] `tests/golden_repos.json` (**202** fixtures: famous + adversarial, >=200 per §1.5), each with
      `expect.domain`, optional `expect.artifact` / `expect.subsystem`
- [x] `tests/test_taxonomy_golden.py`: asserts domain for **every** fixture, artifact/subsystem
      where provided; ≥95% domain accuracy required; named regressions from the review
      (ollama, nginx, vscode, rails, spring-boot, grafana, curl, FFmpeg, kubectl) explicit
- [x] Rule-behavior tests: margin abstain, alphabetical tie, short-keyword guards,
      artifact token separations

## 1.6 Reconcile in CI (finding #4, P1)

- [x] `backfill_123k.yml`: `reconcile_stale_rows.py` runs after harvest, feeds
      `--reconcile` patch into `rebuild_catalog.py`

## 1.7 verify_catalog check #4 + hook bound (finding #10, P1)

- [x] Per-domain shard membership enforced (`misplaced` actually increments): row's
      domain-slug must equal the shard file its deep record lives in
- [x] `hook ≤ 90` chars gate (baseline: 0 violations)
- [x] Row arity accepts 12 **and** 13 fields; validates `domain_margin` range when present
- [x] Unit test proves a misplaced row fails the gate

## 1.8 Curated seed ELI5 reaches the shipped catalog (finding #6b)

- [x] `pipeline/merge_seed_intel.py`: match the 16 curated SEEDS by `owner/name`,
      replace **only** `beginner_intel` + `quickstart_code` in their Tier-2 shard records
      (`--apply` required; default dry-run; idempotent)
- [x] Verified: dry-run on the live catalogue resolves **16/16 seeds, 0 missing** (after the
      `ggerganov/llama.cpp` -> `ggml-org/llama.cpp` and `shadcn-ui/shadcn-ui` -> `shadcn-ui/ui`
      rename fixes in SEEDS); `--apply` runs in **both** workflows; `tests/test_merge_seed.py`
      proves dry-run/apply/idempotency/renamed-seed semantics

## Verification gates

- [x] All suites green: **37 tests** (harvest 14 + golden/rules 10 + reclassify 5 + verify 6 + seeds 4)
- [x] `verify_catalog.py` passes on committed artefacts (12-field rows; **0 misplaced / 0 stray / 0 missing**)
- [x] `reclassify_catalog.py --dry-run` on live 123k → reviewable histogram (captured below)
- [x] `npm run build` + `npm run smoke` pass (unpack carries `domainMargin`; arity + margin-range checks added to smoke)
- [x] Both workflow YAMLs parse (js-yaml; jobs intact)


## Evidence (local run, 2026-09-24)

### Golden set (taxonomy v2)

- **202/202 fixtures = 100%** domain + artifact + subsystem accuracy (acceptance >= 95%,
  size acceptance 200–500). Named expert set (ollama, nginx, vscode, rails, spring-boot,
  grafana, prometheus, curl, FFmpeg, kubectl, docker, redis, TheAlgorithms/Python) all pass.
- Adversarial traps green: `rails-ci-tooling`/`ai-notes`/`webcache-proxy` -> Other,
  `os` vs `repository|gpt-oss|most`, `ai` vs `rails|email`, `sql` vs `graphql`,
  `arm64` vs `farm`, `key value`/`key_value`/`key-value` equivalence.
- Full suite: **37/37 green** (harvest 14, golden + rule behavior 10, reclassify e2e 5,
  verify unit 6, seed merge 4).

### `reclassify_catalog.py --dry-run` on the live 123k catalog (WORST CASE — 0% topics)

```
records: 123,153   topics coverage: 0/123,153 (0.0%)
domain churn     :  92,554  (75.15%)
subsystem churn  :  93,249  (75.72%)
artifact churn   :  24,809  (20.14%)

per-domain stayed/out/in (top):
  Other / General            stayed 28,461  out     0  in 92,429
  Web Platforms & Frameworks stayed  1,218  out 24,013  in    41
  Operating Systems          stayed     76  out 22,584  in     1
  AI & Machine Learning      stayed    230  out 16,970  in     8

top transitions: every v1 domain -> Other / General (24,001 / 22,584 / 16,944 / 13,484 / ...)
margin distribution: 0:64,322  1:44,780  2:12,262  3:1,473  4:242  5:49  6:20  7:5  8:0  9:0
```

Machine-readable: `docs/W2_RECLASSIFY_DRYRUN.json`.

**Read this histogram as the floor, not the outcome.** The committed shards predate §1.4
and carry no `topics`, so reclassify sees only name + 90-char hook + description; the
margin rule (correctly) abstains. On the golden set the same name+description-only
input scores **9.9%** vs **100%** with topics. The CI pipeline supplies topics on the
critical path: `harvest_enumerate.py` stores `repositoryTopics` -> `rebuild_catalog`
merges them into every record and writes `topics[:8]` into the shards -> reclassify
attaches them (fill-if-empty) -> `--min-topics-pct 50` fails the job with exit 3 if
that chain ever breaks. The v1->v2 churn above is the deliberate migration the
`--allow-churn` backfill step applies (steady-state monthly churn should sit far below
the 20% default gate).

### Other gates

| Gate | Result |
|---|---|
| `verify_catalog.py` on committed artefacts | OK — 123,153 rows, 0 misplaced / 0 stray / 0 missing deep records |
| `merge_seed_intel.py` dry-run (live) | 16/16 seeds resolved, 0 missing (post rename fixes) |
| `npm run build` + `npm run smoke` | OK — packed decode, arity 12\|13, margin-range, Tier-2 lazy merge, fallback parity |
| workflow YAML parse | deploy.yml + backfill_123k.yml parse, jobs intact |
| golden accuracy | 202/202 = 100% (acceptance >= 95%) |

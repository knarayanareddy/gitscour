# gitscour review

## 1) Scope and verdict

- Repo: `gitscour`
- Pinned SHA: `19aa39b099b70639432038c8d3b5c34de0225921`
- Stage: implementation with a live static frontend, deterministic pack-time pipeline, and CI/backfill automation; not a prototype, but still carrying backlog debt.
- Sampled evidence: `README.md`, `web/package.json`, `pipeline/search_index.py`, `docs/REMAINING_WORK.md`, `tests/test_checkpoint.py`, `tests/test_harvest_enumerate.py`, `tests/test_history.py`, `tests/test_search_index.py`, plus the smoke gate script via read-only GH source fetch.
- Uninspected boundaries: `web/src/App.jsx`, `web/src/main.jsx`, `web/src/sql-utils.mjs`, `pipeline/rebuild_catalog.py`, `pipeline/verify_catalog.py`, `pipeline/harvest_enumerate.py`, and live Pages/browser behavior.
- Runtime NOT RUN: no local install, build, pytest, browser session, or repo code execution.

## 2) Architecture and product boundary

This is a static GitHub Pages app backed by a Python packing pipeline. The public product boundary is: GitHub GraphQL harvest → pack-time rebuild/search/facets/history artifacts → Vite/React frontend → Pages deploy. `web/package.json` exposes `dev`, `build`, `preview`, `smoke`, and `verify:catalog` scripts; `README.md` describes the same split between pipeline, explorer, and zero-maintenance workflows.

External dependencies are explicit: GitHub API, GitHub Actions, GitHub Pages, React/Vite, and `sql.js` for the SQL Studio path. The search contract is deterministic and mirrored between Python and JS: `pipeline/search_index.py` documents the tokenizer, field weights, and posting format, and the tests pin that behavior.

## 3) Findings ledger

### GSC-1 — historical CI: backfill smoke gate failed on `sql.js` WASM resolution
- Type: historical CI
- Severity: medium
- Evidence: the historical backfill run at SHA `19aa39b099b70639432038c8d3b5c34de0225921` failed in the smoke step; the source shows the SQL Studio/WASM boundary, but the exact runtime cause is unverified here.
- Pinned source quote: `https://github.com/knarayanareddy/gitscour/blob/19aa39b099b70639432038c8d3b5c34de0225921/README.md#L26-L35 — "SQL Studio Mode: WebAssembly SQL execution console allowing arbitrary queries"`
- Pinned source quote: `https://github.com/knarayanareddy/gitscour/blob/19aa39b099b70639432038c8d3b5c34de0225921/README.md#L39-L53 — "Both workflows run the same gate lane before deploying/harvesting"`
- Pinned source quote: `https://github.com/knarayanareddy/gitscour/blob/19aa39b099b70639432038c8d3b5c34de0225921/web/smoke-test.mjs#L246-L257 — "const { default: initSqlJs } = await import('sql.js');"`
- Run anchor: `https://github.com/knarayanareddy/gitscour/actions/runs/41273998064`
- Impact: the monthly backfill did not finish cleanly at this SHA, so the repo is not fully trustworthy as a “zero-maintenance” publication path until the smoke boundary is hardened.
- Recommended correction: make the WASM path deterministic in the shipped smoke path (bundle/copy it into the artifact or resolve it by an absolute module path), then rerun the backfill gate until the smoke job is green.

### GSC-2 — owner decision: the backlog doc still marks implemented search work as open
- Type: owner decision
- Severity: low
- Evidence: `docs/REMAINING_WORK.md` still lists W3 search items as open, while `pipeline/search_index.py` and `tests/test_search_index.py` already implement and pin the search index contract.
- Pinned source quote: `https://github.com/knarayanareddy/gitscour/blob/19aa39b099b70639432038c8d3b5c34de0225921/docs/REMAINING_WORK.md#L117-L121 — "- [ ] At pack time build token → row-ordinals + document frequencies; ship one gzip-friendly"`
- Pinned source quote: `https://github.com/knarayanareddy/gitscour/blob/19aa39b099b70639432038c8d3b5c34de0225921/pipeline/search_index.py#L67-L120 — "def build_search_index(records: List[dict]) -> dict:"`
- Pinned source quote: `https://github.com/knarayanareddy/gitscour/blob/19aa39b099b70639432038c8d3b5c34de0225921/tests/test_search_index.py#L48-L67 — "self.assertIn(\"twinword\", tokens)  # body df==2, kept"`
- Impact: future reviewers can misread backlog as current status and overstate remaining work.
- Recommended correction: either relabel the section as planned roadmap/backlog, or close the entries that are already shipped and tested.

## 4) Five-discipline assessment

- Correctness: strong on the sampled core. Search is deterministic and cross-checked (`tests/test_search_index.py`), checkpoint resume ignores volatile probe fields and dedupes seen rows (`tests/test_checkpoint.py`), and snapshot diffs are stable (`tests/test_history.py`).
- Automation/testing: good coverage for the pack-time invariants and CI gates. The workflows run `pytest`; the smoke gate is real, but GSC-1 shows one production-like failure path still needs repair.
- DevOps/operations: the repo cleanly separates backfill from deploy, and the backfill workflow is meant to publish reviewable artifacts instead of mutating deploys in place. That separation is good; the open blocker is the failing smoke step.
- OWASP/security: no auth/session surface appeared in the sampled paths. The SQL Studio guard is read-only by design (`README.md`), and the zero-LLM guardrail reduces supply-chain surprise, but no live secret/credential audit was run.
- UI/UX/accessibility: the design system is documented, but no browser/UI/accessibility verification was run here. The review cannot confirm contrast, keyboard flow, or the live SQL Studio experience.

## 5) Production blockers and owner questions

- Blocker: fix the SQL Studio WASM resolution so the backfill smoke job passes at the pinned SHA.
- Question: should SQL Studio remain a shipped feature if its runtime asset handling is fragile, or should the README be softened until that path is fully hardened?
- Question: should `docs/REMAINING_WORK.md` be treated as active backlog or as a historical note?

## 6) Evidence inventory and limitations

Inspected ranges:

- `../../evidence/gitscour/numbered-sources/README.md.txt#L1-L189`
- `../../evidence/gitscour/numbered-sources/web/package.json.txt#L1-L31`
- `../../evidence/gitscour/numbered-sources/pipeline/search_index.py.txt#L1-L184`
- `../../evidence/gitscour/numbered-sources/tests/test_search_index.py.txt#L1-L220`
- `../../evidence/gitscour/numbered-sources/tests/test_checkpoint.py.txt#L1-L174`
- `../../evidence/gitscour/numbered-sources/tests/test_harvest_enumerate.py.txt#L1-L220`
- `../../evidence/gitscour/numbered-sources/tests/test_history.py.txt#L1-L171`
- `../../evidence/gitscour/numbered-sources/docs/REMAINING_WORK.md.txt#L1-L220`
- `web/smoke-test.mjs` via read-only GitHub source fetch, lines 1-420

Unrun checks:

- no local `npm install`, `npm run build`, or `npm run smoke`
- no local `pytest`
- no browser/session check of the live Pages site
- no deep inspection of the unmaterialized frontend source files

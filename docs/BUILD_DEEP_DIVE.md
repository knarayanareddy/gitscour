# GitScour — end-to-end deep dive (repo + build + shipped data)

Method: ran the whole thing. `npm ci`, `npm run build`, `npm run smoke`,
`pytest tests/`, `pipeline/verify_catalog.py`, `pipeline/check_zero_llm.py`, plus a
static/data audit of the committed 123,153-row catalogue, a gzip transfer audit of
`dist/`, an ESLint `no-undef` sweep, and a server-side render of `App.jsx` to
exercise the React path that CI never executes.

Headline: **the pipeline is genuinely well engineered and every CI gate passes —
but the deployed site was broken by two undeclared-variable bugs that no gate can
see.**

Status of the findings below: the two P0s, the SQL read-only guard, the dead
statement in `sql-utils.mjs` and the README drift are **fixed in this branch**. The
guard that would have caught the P0s (`npm run lint` → ESLint `no-undef`) is wired
into both workflows. Remaining recommendations are in §8.

---

## 1. P0 — `data is not defined`: the entire Tier-1 path silently falls back  ✅ fixed

`web/src/App.jsx` — the promise callback binds the parameter as `packed`, but the
body reads `data`:

```js
.then((packed) => {                                    // ← line 243 (pre-fix)
  const { domains, subsystems, languages, artifacts, rows } = packed;
  const unpacked = rows.map((r, rowIdx) => {
    const act = Array.isArray(data.activity) ? data.activity[rowIdx] : null;   // ← 243
    ...
    licenseTier: Array.isArray(data.license_tiers) ? data.license_tiers[rowIdx] : null,  // ← 270
  });
  packedForWorkerRef.current = data;                   // ← 282
```

`data` is not declared anywhere in the component or module scope. **Proof it
survives minification** — from the built `dist/assets/index-*.js`, esbuild renamed
the parameter to `c` and left `data` as a free global:

```js
.then(c=>{const{domains:R,...,rows:ye}=c,ve=ye.map((Y,rt)=>{
  const G=R[Y[6]]||"Other / General",oe=Array.isArray(data.activity)?data.activity[rt]:null;
  ... licenseTier:Array.isArray(data.license_tiers)?data.license_tiers[rt]:null, ...
});if(fe.current=data, ...
```

There is no `window.data` and no element with `id="data"`, so this is a
`ReferenceError` on every load. Three separate consequences:

**(a) Always falls back to the 63 MB index.** The `.catch()` fires and fetches
`catalog-index.json`, which is meant to be a last-resort fallback:

| | initial payload (gzip) |
|---|---|
| intended (`catalog-packed.json`) | **13.56 MB** |
| actual (`catalog-index.json`) | **16.40 MB** (+2.83 MB, **+21%**) |

**(b) The grid renders zero rows.** `packedForWorkerRef.current` is never assigned,
so the `init` effect (guard: `... || !packedForWorkerRef.current`) never posts to
the worker. `filter-core.worker.js` then answers every `filter` message with
`light ? filterOrdinals(...) : []` → `ordinals: []`. `filteredRepos` returns
whichever answer the worker last gave, so the catalogue empties out after load.

**(c) Six features go dark.** The fallback rows are a different, flatter shape with
no `activity`, `licenseTier`, `signal`, `topics`, `compatibility` or `domainMargin`
— so the dormant filter, the licence-tier filter, Signal sort/slider and the topic
filter all degrade to null.

Fix: rename the parameter `packed` → `data`. Verified — with it bound, all 123,153
rows unpack with `activity`, `licenseTier` and `signal` populated.

---

## 2. P0 — `minSignal is not defined`: the app renders a blank page  ✅ fixed

`minSignal` / `setMinSignal` are read at lines 1377, 1384, 1386 (the "Min Signal"
slider) but **never declared** — there are 34 `useState` calls and none is theirs.

The slider sits inside the Filter Hub, which the Explorer branch renders
unconditionally (line 1162+, no conditional, no `hidden` class), and `main.jsx`
mounts `App` with no error boundary. React 18 `createRoot` unmounts the tree on an
uncaught render error.

Proven by server-rendering the real component (loading gate forced past):

```
RENDER THREW: ReferenceError: minSignal is not defined
    at App (ssr-probe.js:4124:95)
    at renderWithHooks (react-dom-server-legacy.node.development.js:5662:16)
```

Fixed by declaring the state **and** completing the wiring, which was also missing:

- `const [minSignal, setMinSignal] = useState(0);`
- `minSignal` added to `filterOpts` (the slider moved but never reached the filter)
- `signal` added to the unpack (`filter-core` reads `repo.signal`; App never set
  it, so even the worker path's Signal sort would have been a no-op)
- `"Highest signal"` added to the Sort dropdown — `filter-core` has supported
  `sortBy: 'signal'` all along and the README advertises it, but no option exposed it

After the fix the same SSR probe renders **14,458 bytes** of Explorer HTML instead of throwing.

---

## 3. Why CI stayed green (the structural finding)

`web/smoke-test.mjs` claims it "Mirrors App.jsx's decode", and that word is the
whole problem. It **re-implements** the unpack (lines 25–44) instead of importing
it — so its copy is correct while the shipped copy is broken. Compare its own
header, which gets this right for search: *"The query path is NOT mirrored: this
test imports `src/search-core.mjs`, the exact module App.jsx uses."*

So:

| bug | why the gate missed it |
|---|---|
| `data` | smoke test uses its own unpack, which never references `data` |
| `minSignal` | nothing in CI renders JSX; `vite build` only catches syntax errors |

An ESLint `no-undef` sweep over the **original** `web/src` returns *exactly* the
nine P0 sites and nothing else — zero false positives:

```
App.jsx  243:37  'data' is not defined          (×2)
         243:54  'data' is not defined
         270:40  'data' is not defined          (×2)
         282:38  'data' is not defined
        1377:64  'minSignal' is not defined     (×2)
        1384:28  'minSignal' is not defined
        1386:23  'setMinSignal' is not defined
```

Over the fixed tree the same sweep is clean. A single lint step would have caught
both P0s; there is no lint step in either workflow.

---

## 4. Data layer: the shipped catalogue is a pre-reclassify artefact

Audited `catalog-packed.json` (123,153 rows) directly:

- **Integrity is clean.** 0 duplicate ids, 0 rows under the 500★ floor, 0 hooks over
  90 chars, ids unique and `< 2^53`, fallback index ids identical, 10/10 shards
  covering every row with 0 stray and 0 misplaced. `verify_catalog.py` passes.
- **`domain_margin` is 0 for 100 % of rows.** The W2 §1.1 confidence feature ships a
  schema column that is inert. The engine itself does produce real margins — I ran
  it directly: `kubernetes` → 9, `postgres` → 9, `ollama` → 6, `awesome` → 7,
  unmatched → 0. The committed rows were simply never scored by it.
- **0 % topic coverage.** `facets.topics` is `[]`, `topics_by_domain` is `{}`, and
  `topic-map.json` is 63 bytes (`"topics":[]`). The topic cloud, the Ecosystems
  canvas, the topic filter and search field weight 2.5 are all vacuous today.
- **This is tracked, not accidental.** `docs/W5_CHECKLIST.md` expects them to arrive
  with the next backfill, and `reclassify_catalog.py --min-topics-pct 50` exists
  precisely to refuse a topicless re-score. Worth knowing: on today's data that
  gate **exits 3**, so the monthly backfill will hard-fail at the reclassify step
  unless the harvest supplies topics. `harvest_enumerate.py:377` does request
  `repositoryTopics`, so a real sweep should satisfy it.
- **The blast radius is documented:** `docs/W2_RECLASSIFY_DRYRUN.json` shows a
  topicless re-score moves **92,429 rows (75.2 %) into "Other / General"**. The gate
  is doing real work.
- **"Application / Service" is 70.7 %** of the catalogue. That is the single
  unchecked item left in all five checklists (W2 line 48: *"Application/Service
  share drops below 50 % on live re-score"*) — it can only be closed by a real
  backfill.
- **37 % of rows have licence tier `unknown`** (45,593).

## 5. Artefact format: real but acknowledged debt

Every committed artefact is single-line JSON (`wc -l` = 0), while `linejson.write`
always emits a trailing newline — so these files predate the W5 O.3 writer. The
benefit O.3 was built for (measured at 3,146× smaller diffs) is not realised yet.
The W5 checklist says so explicitly: *"Existing files stay old-format until the
next CI backfill (which rewrites them anyway)."*

Deploy cost today: **292 MB `dist/`, 24 files**, uploaded on every push to
`main`/`arena/*` plus weekly. Tier-2 shards are correctly lazy-loaded per domain,
but the largest (`other-general.json`, 23 % of the catalogue) is still **3.1 MB
gzip** on first modal open.

## 6. Smaller findings

~~- **SQL Studio's read-only guard is prefix-only.** `isReadOnlySql` checked only the
  leading keyword while `db.exec` runs *every* statement, so
  `SELECT 1; DROP TABLE repos` was **ALLOWED**, contradicting the README's
  "mutation statements are rejected". Impact was limited (client-side in-memory DB,
  self-inflicted) but it was a documented guarantee that did not hold.~~
  **Fixed:** `isReadOnlySql` now splits on top-level `;` (string literals and
  comments respected) and requires *every* statement to start with `SELECT`/`WITH`.
  17 cases pinned, including the four already asserted by `smoke-test.mjs`.
~~- **Dead statement** in `sql-utils.mjs**: `s.replace(...)` discarded its result
  (strings are immutable); the next line repeated it correctly.~~ **Fixed.**
- **Docs drift:** the README's artefact list omitted "Application / Service" (the
  70.7 % majority) and "Template / Starter", and said "System Engine" where the code
  emits "System Service / Engine". **Fixed**; the `App.jsx` comment claiming 7.98 MB
  gzip for the packed index measures 8.41 MB.
- **`npm audit`: 2 advisories** (vite high — path traversal / `server.fs.deny`
  bypass; esbuild moderate — dev-server CORS). Both are dev-server only and do not
  reach the static build, but they are the direct dependency and worth a bump.
- **Docs drift:** the README's artefact list omits "Application / Service" (the
  70.7 % majority) and "Template / Starter", and says "System Engine" where the code
  emits "System Service / Engine". The `App.jsx` comment claims 7.98 MB gzip for the
  packed index; measured 8.41 MB.
- **Test coverage gaps:** `App.jsx` (2,100 lines — where both P0s lived) has zero
  tests. No dedicated tests for `rebuild_catalog.py` (656 lines), `neighbors.py`,
  `facets.py`, `generate_seed.py` or `reconcile_stale_rows.py`. 153 pytest tests
  pass and are genuinely network-free, but they cover the pipeline, not the UI.

## 7. What is genuinely good

- `verify_catalog.py` is a real, opinionated integrity gate (id uniqueness, JS-safe
  ids, dictionary bounds, shard↔domain placement, hook bound, row arity) and it
  passes on 123k rows in 4 s.
- The **zero-LLM guardrail is enforced, not aspirational**, and scans itself.
- The deploy/backfill split is the right architecture: the backfill opens a PR with
  regenerated data, and `deploy.yml` publishes *exactly the committed bytes* rather
  than harvesting during the build. The comment explaining that this replaced a
  job that silently shrank the deployed shards is a good decision, well documented.
- The search index is well designed — delta-encoded postings, `(tf<<10)|field_mask`
  packing, a precomputed field-mask weight LUT — and it is fast: measured
  **0.09–0.67 ms median** for `'raft'` / `'simd'` / `'sql vector'`.
- `rebuild_catalog.py` factored into single-writer units so `reclassify_catalog.py`
  reuses the exact same code path. That refactor is why a taxonomy fix can reach
  live rows at all.
- Honest empty states everywhere: the changelog seeds a baseline with a `note`
  instead of inventing deltas, and the Ecosystems tab says "No topic data in this
  build yet."
- Determinism is taken seriously: mulberry32 seeding (no `Math.random`),
  byte-identical same-day snapshots, blake2b re-keying of out-of-range ids.

## 8. Recommendations

| # | Action | Why |
|---|---|---|
| # | Action | Status |
|---|---|---|
| 1 | Ship the two P0 fixes | ✅ done, verified by SSR render + full gate lane |
| 2 | Add ESLint + `no-undef` to both workflows | ✅ done — `npm run lint`, 0 errors |
| 3 | Make `isReadOnlySql` validate every `;`-separated statement | ✅ done, 17 cases pinned |
| 4 | Correct the README artefact list / SQL guarantee | ✅ done |
| 5 | Extract the unpack into `web/src/unpack-core.mjs`, import it from `App.jsx` **and** `smoke-test.mjs` | 🔜 kills the mirror-vs-import gap; mirrors the existing `search-core.mjs` pattern |
| 6 | Add a component render smoke test (SSR `renderToString` is enough) | 🔜 nothing in CI renders JSX today; lint covers typos, not logic |
| 7 | Run one real backfill to regenerate artefacts | 🔜 unblocks topics, margins, line-oriented diffs, and the last open W2 criterion in one pass |
| 8 | Bump vite/esbuild | 🔜 dev-server-only CVEs in the direct dependency |

---

### Verification log (all re-run after the fixes)

```
pytest tests/ ............ 153 passed
verify_catalog.py ........ OK: 123,153 repositories, internally consistent
check_zero_llm.py ........ clean: 46 files scanned
npm run build ............ ✓ built in 3.61s (dist 292 MB)
npm run smoke ............ OK: packed decode, ranked search, edges, facets,
                               Tier-2 merge, fallback index consistent
ESLint no-undef .......... 0 problems (was 9)
SSR render of App ........ 14,458 bytes of Explorer HTML (was ReferenceError)
```

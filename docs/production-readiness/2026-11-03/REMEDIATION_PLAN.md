# gitscour remediation plan

## Roadmap

### Phase 0 — baseline and reproduction
Entry: historical smoke failure is acknowledged.
Exit: the failure is reproduced or explained from the current artifact path, and the exact SQL Studio/WASM boundary is identified.

### Phase 1 — confirmed defect repair
Entry: the smoke path is understood.
Exit: the backfill smoke job passes at the pinned SHA and the same fix does not break deploy.

### Phase 2 — guardrails and documentation hygiene
Entry: core CI is green.
Exit: the smoke gate has a regression test, and backlog docs no longer misstate current implementation status.

## Task dependency map

| Task | Depends on | Parallel? |
| --- | --- | --- |
| GSC-R1 | none | yes |
| GSC-R2 | GSC-R1 | no |
| GSC-R3 | GSC-R1 | yes |

## GSC-R1 — stabilize SQL Studio WASM resolution in the smoke path
- Linked finding: GSC-1
- Observed path: `web/smoke-test.mjs`
- Prerequisites: confirm where the `sql.js` WASM file is expected to live in the shipped artifact.

1. Trace the current loader path in the smoke gate and verify whether the failure comes from a missing file, a bad relative path, or an incomplete install artifact.
2. Change the resolution so the smoke path uses a deterministic module/file lookup that works in CI and in the built artifact, not a cwd-dependent guess.
3. Re-run the smoke contract on the built output and confirm the SQL Studio section completes without the `sql-wasm.wasm` ENOENT.

Expected deliverable: a smoke gate that can initialize `sql.js` consistently.

Verification:
- `npm run smoke` (planned, not executed here)
- the backfill workflow job for the same SHA finishes without failing on the SQL Studio step

[ ] SQL Studio initialization no longer throws ENOENT for `sql-wasm.wasm`
[ ] The smoke gate still validates ranked search, facets, edges, and history
[ ] The fix does not alter the read-only SQL guard behavior

## GSC-R2 — add a regression check for the WASM asset boundary
- Linked finding: GSC-1
- Observed/proposed paths: `web/smoke-test.mjs`, `.github/workflows/backfill_123k.yml`, `.github/workflows/deploy.yml`
- Prerequisites: GSC-R1 is in place or the root cause is clearly isolated.

1. Add an explicit check that the SQL Studio asset path exists before the SQL demo runs, so the gate fails with a direct message instead of a low-level abort.
2. Add one negative-path assertion or fixture note so a deliberately missing asset fails for the right reason.
3. Keep both CI workflows pointed at the same gate so deploy and backfill stay in lockstep.

Expected deliverable: a small guardrail that turns a vague runtime abort into a readable failure.

Verification:
- the smoke script fails fast with a clear message if the asset is missing
- the same script passes when the asset exists

[ ] The smoke gate reports the missing asset directly
[ ] A deliberately broken asset path fails the regression check
[ ] Both workflows still use the same smoke contract

## GSC-R3 — reconcile backlog documentation with shipped search code
- Linked finding: GSC-2
- Observed path: `docs/REMAINING_WORK.md`
- Prerequisites: none

1. Decide whether `docs/REMAINING_WORK.md` is a live backlog or a historical planning note.
2. If it is live backlog, rename the section so readers do not confuse it with current status; if it is historical, close or annotate the implemented W3 search items.
3. Keep the implemented contract and the plan doc aligned so future authors do not re-open already shipped work.

Expected deliverable: the backlog doc matches the actual implementation state.

Verification:
- the documented open items reflect reality
- implemented search work is either marked done or explicitly retained as a future enhancement

[ ] The search-index backlog text no longer reads as current unfinished work
[ ] The doc’s status labels match the shipped code and tests
[ ] Reviewers can tell backlog from implementation at a glance

## Acceptance checklist

- [ ] Backfill smoke job green at the pinned SHA
- [ ] Deploy workflow still green after the fix
- [ ] SQL Studio remains read-only and deterministic
- [ ] Search, checkpoint, and history tests still describe the shipped contract
- [ ] Backlog docs and source reality agree

## Approval and rollback policy

- Any change to SQL Studio runtime resolution or artifact packaging needs owner sign-off because it touches the shipped Pages experience.
- If a fix destabilizes deploy or backfill, revert only the smoke-path change first; keep the deterministic search/index code untouched unless it is the proven cause.
- Do not loosen smoke thresholds to get green; tighten the artifact path instead.

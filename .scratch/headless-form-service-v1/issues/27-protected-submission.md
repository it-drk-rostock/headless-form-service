# 27: Protected submission

**What to build:** Submitting a protected form uses up one use of the form pass, but only if the submission is actually accepted.

**Blocked by:** 12 (Submission is queued encrypted), 26 (Protected form loading)

**Status:** ready-for-human

- [x] The pass is claimed atomically (use count incremented only while still valid), otherwise 403
- [x] If QStash publishing fails, the claim is released
- [x] A single-use pass cannot be used twice, even with concurrent submissions
- [x] The pass ID travels inside the encrypted payload
- [x] Handler tests for claim, release and concurrency

## Comments

**2026-10-08, agent:** Implementation complete for human review. The parent spec is `docs/technical_blueprint.md` (§3, §4.2 and §6); there is no feature-local `spec.md`.

- The embed forwards the hosting page's `form_pass` to `/submit-form`. Protected submissions hash the secret and atomically reserve a valid use through the service-only `claim_form_pass` RPC. Missing, unknown, wrong-form, revoked, expired and exhausted passes receive 403. Earlier validation failures consume no use; public forms still need no pass.
- Migration `20261008110001_protected_submission.sql` adds a private reservation keyed by submission ID. Distinct submissions compete for remaining uses; overlapping attempts and retries of the same submission share one use. `finish_form_pass_claim` retains the use if any attempt published, and releases it once all attempts failed. Cleanup preserves another attempt's active or accepted stats row. Reservations store only IDs and attempt state and are deleted with their pass.
- The pass ID is inside the encrypted answer payload. Neither the raw secret nor a plaintext pass ID is sent to QStash. Encryption, queue and publish failure paths finish the reservation; publishing failure returns 503 with independent best-effort cleanup.
- Handler and database regressions cover atomic claims, invalid passes, rollback, distinct-ID single-use races, same-ID retries, missing message confirmation, mixed concurrent publish outcomes, cleanup and service-only privileges. Pass metadata rendering remains ticket 28.
- Validation: `npm test -- --maxWorkers=4` passes, **866 tests in 59 files**. `npm run typecheck`, Biome on all seven changed TypeScript files, `git diff --check`, and `npm run build` pass. Repository-wide `npm run lint` reports four pre-existing formatting errors in `vitest.config.ts`, `.agents/skills/setup-ts-deep-modules/dependency-cruiser.config.cjs`, and the two vendored QStash multi-region verification scripts; these files are unchanged. Tests and the production build required execution outside the sandbox for local cache/proxy access.

## Standards

Independent review against starting commit `f37f86265473aab9fb1ff5ebf51166ee46b0f574`: **0 findings**. The service-only RPCs, empty search paths, private reservation data and portable handler seams follow the documented standards; no actionable baseline smells were found.

## Spec

Independent review: **0 remaining findings**. The initial finding that same-ID retries could consume multiple uses was fixed with shared reservations and regression tests. All five acceptance criteria are implemented, with no scope creep identified.

Review totals: Standards 0; Spec 0. Neither axis has a remaining issue.

## Human review handoff

1. Ensure ticket 25's form-pass migration is applied. Apply the new migration with `npm run db:push`, then deploy the updated function with `npm run functions:deploy -- submit-form`. Rebuild/redeploy the dashboard using the README's normal process to publish the updated `embed.js`. No new secret is needed. This agent has not deployed to the shared cloud environment.
2. On an allowed-origin test page, use a published protected form and a disposable single-use pass. Load/reload without submitting: uses must remain `0 von 1`. Submit valid answers: expect 202, the completion notice and `1 von 1`. Inspect the QStash envelope: the pass ID belongs inside ciphertext alongside answers.
3. Replay the accepted request with the same submission ID: expect 202 and one consumed use. Submit with a fresh ID and the same exhausted pass: expect 403. For the race check, preload two tabs with a fresh single-use pass, then submit concurrently with distinct IDs: expect one 202, one 403 and one use. Obtain fresh Turnstile tokens when enabled.
4. Check missing, unknown, wrong-form, revoked and expired passes are refused, and a public form still submits without a pass. Invalid answers and failed Turnstile checks must consume no use. Local failure tests verify QStash rollback and mixed outcomes without changing shared live credentials.
5. Confirm downstream delivery still works. Pass-placeholder rendering is outside this ticket. Stop after ticket 27 review; no subsequent ticket was started.

Review limitation: PGlite executes transactions serially, so its database tests verify state transitions rather than real overlapping PostgreSQL sessions. The live two-tab race is the remaining human concurrency check. Reservation finalization is best effort if the database becomes unavailable after claiming; failures are logged and can leave a reserved use requiring reconciliation.

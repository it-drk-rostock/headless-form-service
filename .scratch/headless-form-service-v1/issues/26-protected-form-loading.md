# 26: Protected form loading

**What to build:** Visitors with a valid form pass link see the protected form; everyone else gets a German 'link invalid or expired' message and never sees the questions.

**Blocked by:** 11 (`embed.js` shows a public form), 25 (Form passes in the dashboard)

**Status:** ready-for-human

- [x] The embed reads `form_pass` from the page URL
- [x] `/load-form` validates the pass (not revoked, not expired, uses left) without consuming it
- [x] Invalid or missing pass -> 403 and no questions returned
- [x] Handler tests for each invalid case

## Comments

**2026-10-07, agent:** Implementation complete for human review. The parent spec is `docs/technical_blueprint.md` (§3, §4.1 and §6); there is no feature-local `spec.md`.

- The embed reads `form_pass` from `window.location.href` and forwards only that query parameter with the form ID. Missing, empty and fragment-only values send no pass. Existing German invalid-link messaging prevents mounting questions after a refused load.
- `/load-form` hashes the secret with the shared SHA-256 helper and reads only validity fields from `form_passes`, filtering by both form ID and hash. It checks revocation, expiry (including exactly now), and remaining uses. Unlimited uses and no expiry remain valid. Loading never updates the pass.
- Invalid passes return `403 { "error": "form_pass_invalid" }`, with CORS and no-store headers, no questions, and no counted load. Database errors fail closed. Closed forms still return their closed state before checking passes; public forms need no pass.
- Handler tests cover missing, empty, unknown, hash-as-secret, wrong-form, revoked, expired, exactly-expiring and exhausted passes, valid boundaries, repeat loading without consumption, and database failure. Embed tests cover forwarding/encoding and absent query values.
- No database migration or secret change is needed beyond ticket 25. Protected submission claiming remains ticket 27.
- Review against starting commit `42ceb5ad3cae11c19d07c6cbcaa7fde7e3584b2a`: **Standards: 0 findings. Spec: 0 findings.** Both reviews ran independently.
- Validation: `npm test -- --maxWorkers=4` passes, **817 tests in 58 files**. Type checking, Biome on all six changed TypeScript files, `git diff --check`, and `npm run build` also pass. Sandbox runs hit temporary module-cache errors; tests passed outside the sandbox, and the build also required an unsandboxed retry for its local Cloudflare proxy.

For the human, in this order:

1. Ensure ticket 25's form-pass migration has been applied. Deploy the updated `/load-form` function and rebuild/redeploy the dashboard to publish the updated `embed.js`. Use the normal deployment commands in the README; this agent has not deployed to the shared cloud environment.
2. On an allowed-origin test page, embed a published protected form. Create a disposable single-use pass in the dashboard and open its link. Expect the current questions (and Turnstile when enabled).
3. Reload that link twice. The dashboard must still show `0 von 1` uses. Confirm `/load-form` responses have `Cache-Control: no-store`.
4. Remove `form_pass`, replace it with an unknown secret, and try a pass for another form. Expect *Dieser Link ist ungültig oder abgelaufen.*, a 403 load response, and no schema/questions.
5. Revoke the pass and reload its link: expect the same refusal. Expired and exhausted passes are also covered by the handler tests.
6. Check that a public form still loads without a pass and a closed protected form shows its closed notice.

Review limitation: a valid pass now enables loading, but protected submissions still receive 403 until ticket 27. This handoff covers ticket 26 only; no subsequent ticket was started.

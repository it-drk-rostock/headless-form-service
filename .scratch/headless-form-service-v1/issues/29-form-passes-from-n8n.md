# 29: Form passes from n8n

**What to build:** n8n creates form passes for protected forms through `/generate-form-pass` with one global Bearer key (ADR-0005), never with the service-role key.

**Blocked by:** 25 (Form passes in the dashboard)

**Status:** ready-for-human

- [x] The Bearer key is checked against `N8N_INTEGRATION_KEY`
- [x] Input: form ID (must be a protected form), use limit (default 1, null = unlimited), expiry hours (default 48), metadata
- [x] Output: pass secret, expiry, and URL when a form page is set
- [x] Passes are created with source `n8n`; handler tests include a bad key and a public form

## Comments

**2026-10-08, agent:** Implementation is done and ready for human review. The parent spec is `docs/technical_blueprint.md` §7 (with §3 and §9), plus ADR-0005. There is no feature-local `spec.md`.

- **Endpoint** (`supabase/functions/generate-form-pass/`):
  - `POST` only. `handler.ts` holds all the logic and `index.ts` wires it up. `config.toml` sets `verify_jwt = false`, since n8n sends no Supabase JWT.
  - The key comes from `Authorization: Bearer <key>`, with a case-insensitive scheme. It is compared with `N8N_INTEGRATION_KEY` through the SHA-256 digests of both, without exiting early, before the body is read.
  - A missing or wrong key gets 401 `unauthorized` with `WWW-Authenticate: Bearer`.
  - `index.ts` trims the secret and refuses to start without it.
- **Input:** `{ form_id, max_uses?, expires_in_hours?, metadata? }`.
  - `max_uses` defaults to 1, `null` means unlimited, and the maximum is 10000 (as in the dashboard).
  - `expires_in_hours` defaults to 48, maximum 8760.
  - `metadata` is checked with the shared `passMetadataProblem`.
  - Anything invalid gets 400 `{ error: "request_invalid", field }`.
- **Output:** 201 `{ form_pass, expires_at, url? }` with `no-store`.
  - The secret is made and hashed by the same shared helpers the dashboard uses.
  - `url` is `<form page>?form_pass=<secret>`. It is left out when the form has no form page.
- **Database:** migration `20261008120000_n8n_form_passes.sql` adds `public.create_n8n_form_pass(form, token_hash, max_uses, expires_at, metadata)`.
  - Only `service_role` can execute it.
  - It inserts the pass with source `n8n` and no `created_by`, and returns the form page.
  - It raises `HF010` for a public form, which the endpoint turns into 409 `form_not_protected`.
  - It raises `HF011` for an unknown or archived form, which becomes 404 `form_not_found`.
  - The existing audit trigger records `form_pass.created` with source `n8n` and no actor. The dashboard already shows such passes as *über n8n*.
- **Shared code:** the pass limits, the defaults and `isCountUpTo` moved to `lib/shared/form-pass.ts`, so the dashboard and the endpoint check them the same way.
- **Choices to review:**
  1. **`expires_in_hours: null` is refused**, so every n8n pass expires. §7 allows `null` only for `max_uses`. The dashboard still offers "no expiry".
  2. **Archived forms are treated like unknown ones (404).** They refuse loads anyway. Closed forms and forms that were never published still get passes, as in the dashboard.
  3. **Unknown body fields are refused** with their name, to catch typos in n8n workflows.
  4. There is no rate limit and no body size cap. Every request needs the key, and the spec asks for neither.
- **Tests:**
  - Handler, 33 tests: defaults and link, explicit options, unlimited passes, no form page, a fresh secret per pass, 6 bad or missing key forms, the key checked before the body, a public form (409), an unknown form (404), 16 invalid inputs, 405, 500.
  - Database (`supabase/tests/n8n-form-passes.test.ts`): the row has source `n8n` and no creator; the form page or null is returned; the audit entry; HF010 and HF011 (including archived forms); invalid metadata; only the secret key can execute the function.
- **Docs:** a new README section, *Form passes from n8n*.
- **Validation:**
  - `npm test -- --maxWorkers=4` passes: **918 tests in 61 files**.
  - `npm run typecheck`, Biome (checked as LF) on all changed TS/TSX files, `git diff --check` and `npm run build` also pass.
  - Not run: `deno check`, because Deno is not installed here. No deploy and no real request were made.

## Standards

Independent review against `eabc38e`: **0 documented-standard violations**. Five baseline smells were found and all are fixed:
- `isCountUpTo` was duplicated. It is now shared.
- `lib/forms/passes.ts` re-exported the shared constants (a middle man). The re-export is gone, and `FormPasses.tsx` imports them from `lib/shared/form-pass.ts`.
- `createPass` returned an unnamed union. It is now `CreatedFormPass`.
- `index.ts` used the bare codes `HF010` and `HF011`. They are now named constants.
- `FIELDS` is renamed `REQUEST_FIELDS`.

Left as is: the small SHA-256 byte digest in the key check. `hashFormPassSecret` returns hex for storage, so sharing it would not simplify anything.

## Spec

Independent review: all four criteria are implemented, with **0 blocking findings**. The Bearer check was judged sound:
- it compares the digests in constant time;
- it refuses an empty key;
- it runs before the body is read;
- the function is granted only to `service_role`.

One minor finding was fixed: a trailing newline in the secret would refuse every request, so `index.ts` now trims the key. Recorded as acceptable: refusing null expiry (choice 1); the extras (405, `WWW-Authenticate`, case-insensitive scheme); and no rate limit or size cap.

Review totals: Standards 0 violations, 5 smells (all fixed); Spec 0 blocking, 1 minor (fixed).

## Human review handoff

1. **Deploy.**
   - Run `npm run db:push` to apply `20261008120000_n8n_form_passes.sql`.
   - Set the key with `npx supabase secrets set N8N_INTEGRATION_KEY=<output of: openssl rand -base64 32>`.
   - Run `npm run functions:deploy -- generate-form-pass`.
   - Rebuild the dashboard using the README's normal process (only imports changed there).
   - Tickets 25–27 must already be applied. This agent has not deployed to the shared cloud environment.
2. **n8n credential.** Create a Header Auth credential in n8n: `Authorization` = `Bearer <key>`.
3. **Happy path.** POST `{"form_id":"<protected form with form page>","metadata":{"ticket":"T-4711"}}` to `/functions/v1/generate-form-pass`, from n8n or curl.
   - Expect 201 with `form_pass`, an `expires_at` 48 hours ahead, and `url`.
   - In the dashboard's *Pässe* view the pass shows `0 von 1`, *über n8n* and the metadata. The audit log shows *Pass angelegt … über n8n*.
   - Open the `url` on the allowed-origin test page and submit. The pass becomes *Aufgebraucht*.
4. **Options.** Send `"max_uses": null, "expires_in_hours": 2`: expect an unlimited pass that expires in two hours. For a protected form without a form page, expect no `url`.
5. **Refusals.** Each of these should create nothing in *Pässe*:
   - no header, or a wrong key: 401;
   - a public form: 409 `form_not_protected`;
   - an unknown or archived form: 404;
   - `"max_uses": 0`: 400 with `field: "max_uses"`.
6. **Stop.** Stop after the ticket 29 review. No subsequent ticket was started.

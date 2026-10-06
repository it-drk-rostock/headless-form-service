# 10: `/load-form` endpoint

**What to build:** The public loads a form's current version through `/load-form` (ADR-0004); the anon role has no table access. Requests from origins not on the allowed origins list are refused. Each load is counted per form and day.

**Blocked by:** 01 (Backend tooling), 09 (Publishing)

**Status:** ready-for-human

- [x] Handler with injected dependencies, covered by handler tests
- [x] CORS allows only allowed origins (seeded in the `settings` row for now)
- [x] Returns version number, questions and access type of the current version
- [x] Unknown, unpublished or archived form -> 404
- [x] `form_load_counts` incremented per form and day
- [x] Verified that the anon role cannot read any table directly

## Comments

**2026-10-06, agent:** Repo side done. All six criteria are met and tested: the handler with fakes, the SQL against the migrations (PGlite). The migration still needs pushing, the function deploying, and the cloud checks running, by a human (ADR-0006).

- **Database:** migration `supabase/migrations/20261006090000_load_form.sql`.
  - `public.settings`: one row (`id boolean` primary key, always true). For now only `allowed_origins`, seeded with `http://localhost:3000`. Rate limits and allowed recipient domains come with tickets 14 and 21, the page with ticket 20. Only the secret key reads it; nobody writes through the Data API.
  - `public.form_load_counts (form_id, day, count)`, primary key `(form_id, day)`, cascading with the form. No Data API access for anyone, the secret key included.
  - `public.load_form(form)`: the current version's `version`, `schema` and `access_type`, for a form that is published and not archived. No row otherwise. Security invoker.
  - `public.count_form_load(form)`: adds one for today in **Europe/Berlin**. Security definer, so even the secret key can only add one, never set a count.
  - Both functions are executable only by `service_role`.
- **Edge function `load-form`:** `GET /functions/v1/load-form?form_id=<uuid>`, `verify_jwt = false` in `config.toml`.
  - `handler.ts` takes injected `allowedOrigins`, `loadForm` and `countLoad`; `index.ts` wires them to supabase-js with `SUPABASE_SECRET_KEYS.default`.
  - CORS lives in `supabase/functions/_shared/cors.ts`, for `/submit-form` to reuse. The origin must match an entry exactly. Other origins, and requests without `Origin`, get 403 before the form is looked at. Preflights from allowed origins get 204. The list is read on every request.
  - Answers: 200 `{ version, schema, access_type }`; 400 `form_id_missing`; 404 `form_not_found` for unknown, never published, archived or non-UUID IDs; 405 for other methods; 500 `internal_error`. Every answer is `no-store`.
  - Only served loads are counted. If counting fails, the form is still served and the error is logged.
- **Anon verified:** check 32 in `supabase/snippets/rls-checklist-teams.sql` (now 32 checks) asserts that anon has no privilege on any table, view, sequence or column in `public` and `private`, and cannot execute either function. Four new tests show it catches a table grant, a column grant and each function grant.
- **Checks:** `npm test` passes, 257 tests. `npm run typecheck` and Biome on the changed files pass. Not run: `deno check` on `index.ts` (Deno isn't installed on this machine), and no deploy or real request.
- **Review:** two-axis review. Fixed:
  - Check 32 called `load_form` to test the grant. As a security invoker function it fails on the tables anyway, so a stray grant would have passed. It now asks `has_function_privilege`.
  - A counting failure turned every load into a 500.
  - Missing keys failed later as an opaque 500; `index.ts` now throws at boot.
  - The 403 for refused origins could be cached.
  - The anon-privilege query was duplicated in a Vitest test and the checklist.
  - The CORS comment claimed it stopped scripts from inflating counts. Only rate limiting (ticket 14) does that.

For the human, in this order:

1. `npm run db:push`.
2. In the SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 32 of 32 checks`.
3. `npm run functions:deploy -- load-form`.
4. Publish a form in the dashboard, note its ID, then:

   ```bash
   curl -i -H "Origin: http://localhost:3000" "https://qhjysorczroizpgmagpp.supabase.co/functions/v1/load-form?form_id=<id>"
   ```

   Expect 200, `access-control-allow-origin: http://localhost:3000` and `{"version":…,"schema":…,"access_type":"public"}`. This also confirms the gateway accepts the secret key that supabase-js sends.
5. The same with `-H "Origin: https://evil.example"`, and without `-H`: both 403 `origin_not_allowed`.
6. A random UUID, and a form never published: both 404.
7. `select * from form_load_counts;` should show the loads from step 4 under today's date.
8. Without any key: `curl "https://qhjysorczroizpgmagpp.supabase.co/rest/v1/forms" -H "apikey: <publishable key>"` should fail with `permission denied` (42501).

Open points for the reviewer:

- **Protected forms get 403 `form_pass_invalid`** without questions, until ticket 26 checks passes. Their access type can't be set yet anyway.
- **Closed forms are served normally.** Ticket 23 adds the `closed` state.
- **Request shape is `GET ?form_id=`**, a simple CORS request with no preflight. Ticket 26 must decide how the form pass travels. If it goes in a header, add it to `access-control-allow-headers` (now only `content-type`).
- **Malformed IDs get 404**, not 400, so all "no such form" cases look alike.
- **Settings seeded with only `http://localhost:3000`.** Add TYPO3 origins in the SQL editor until ticket 20 (README, "Loading forms").
- **Day boundary is Europe/Berlin.** Ticket 32 should read the counts the same way.

**2026-10-06, human → agent:** `db:push` worked, but the cloud checklist failed with `RLS check 32 failed: anon has a privilege on a table, view or sequence`.

**2026-10-06, agent:** Cause: `audit_log.id` is an identity column. Its sequence `public.audit_log_id_seq` got Supabase's default grants on new sequences in `public`, which include anon. Revoking the table's grants doesn't touch its sequence. The PGlite stub copied the defaults for tables and functions but not for sequences, so `npm test` missed it. The check works as intended: it found a real exposure (low impact, since PostgREST doesn't serve sequences, but it still breaks ADR-0004).

- New migration `20261006120000_audit_log_sequence_grants.sql` revokes the sequence from anon, authenticated and service_role. Nobody needs it: `private.record_audit()` writes as the table owner.
- The stub now copies Supabase's sequence defaults too. With that, the checklist test failed until the migration was added.
- Check 32 now names the exposed objects in its error.
- `npm test` passes, 258 tests.

For the human: run `npm run db:push` again, then rerun the checklist. Expect `RLS checklist passed: 32 of 32 checks`. Then continue with step 3 above.

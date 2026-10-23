This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Branding and direct form pages

The app uses the DRK shell icon, full logo and favicon at the supplied
`https://www.drk-rostock.de/fileadmin/intranet/` URLs. These assets require
that server to be reachable. `NEXT_PUBLIC_APP_LOGO_WIDTH=150` and
`NEXT_PUBLIC_APP_LOGO_HEIGHT=48` control the full logo dimensions at build time.
The company name is DRK Kreisverband Rostock e.V.

Visitors can fill in a published form at `/submission/<form-id>` without a
dashboard account. The form's Embed tab shows the configured external form page
alongside the direct link at `https://drk-rostock-formulare.de/submission/<form-id>`.
This page
uses the existing embed and public edge functions, including the current form
version, themes, closed/archived handling, form passes and bot protection.
It does not display stored submissions.

Before sharing, add the app's origin (scheme and hostname, with port if needed)
to **Allowed origins** in global settings. If Turnstile is enabled, also allow
the app's hostname in that widget's Cloudflare configuration. For a protected
form, save the direct URL as its **Formularseite**, then create a form pass;
the generated link will include `?form_pass=<secret>`. Existing pass secrets
also work on the direct page when supplied through that parameter. Unpublished
and archived forms remain unavailable. The direct page prevents caching and
referrer disclosure and asks search engines not to index it.

## Backend

There is one cloud Supabase project for development and production ([ADR-0006](docs/adr/0006-single-cloud-environment.md)): every migration and function deploy goes to the live system.

- `supabase/migrations/`: database schema. Apply with `npm run db:push`.
- `supabase/functions/<name>/`: Deno edge functions. Deploy with `npm run functions:deploy` (all) or `npm run functions:deploy -- <name>`.
- `lib/shared/`: code shared by the dashboard, the edge functions and the embed. Web-standard APIs only, imported with explicit `.ts` extensions so Deno can load it.

Link the CLI once per machine:

```bash
npx supabase login
npx supabase link --project-ref qhjysorczroizpgmagpp
```

### Edge function test seam

Each function is a thin `index.ts` that only calls `Deno.serve` and wires real dependencies into a portable `handler.ts`. The handler takes a `Request` plus injected dependencies and returns a `Response`, using Web-standard APIs only, so Vitest tests it in Node with in-memory fakes. See `supabase/functions/ping/` for the pattern.

`npm test` runs every `*.test.ts` under `app/`, `embed/`, `lib/`, `supabase/functions/` and `supabase/tests/`. `npm run typecheck` covers everything except the Deno entry points and `supabase/functions/_shared/service.ts`, which they share.

## Dashboard

Next.js with Mantine, styled per [`docs/ui-design.md`](docs/ui-design.md). All UI text comes from German i18n keys in `lib/i18n/de.ts`; components call `t("key")` and never inline strings.

- `app/_shell/`: the app shell (icon rail, module sidebar, breadcrumb top bar). Modules are listed in `app/_shell/navigation.ts`.
- `app/(dashboard)/`: pages rendered inside the shell.

```bash
npm run dev
```

Copy `.env.example` to `.env.local` and fill in the publishable key before running or building the dashboard.

### Login

Staff log in with email and password at `/login`. There is no sign-up, no self-service password reset and no MFA (blueprint §2.3).

- `proxy.ts` refreshes the Supabase session on every request and sends signed-out visitors to `/login`. Pages still check the session themselves with `requireProfile()` (`lib/auth/profile.ts`).
- Invite and set-password emails link to `/auth/confirm`, which signs the person in and sends them to `/set-password`.
- `public.profiles` has one row per auth user, created by a trigger on `auth.users`. `npm test` runs the migrations against an in-memory Postgres (PGlite) in `supabase/tests/`.

#### Auth settings in the repo

`supabase/config.toml` holds the target auth settings for production:

- sign-up is off
- the minimum password length is 10
- MFA is off
- auth emails go through IONOS SMTP, using the German templates in `supabase/templates/`

Nothing in it reaches the cloud project until someone runs `npx supabase config push`. The values outside the auth sections mirror the cloud project. Run `npx supabase config diff` before every push, so that only intended changes are applied.

Accepted limitations:

- Supabase cannot switch off its public password-recovery endpoint. Someone who calls the API directly can still have a set-password link sent to their own mailbox. The dashboard offers no way to do this.
- `/set-password` changes the password of whoever is signed in, without asking for the current password. This is the same trust a valid session already has.

#### Current setup: local testing

For now the dashboard runs only locally (`npm run dev`, `http://localhost:3000`), against the cloud project, using Supabase's built-in SMTP. `config.toml` is **not** pushed: its IONOS block needs credentials, and with built-in SMTP Supabase may refuse custom templates.

1. `npm run db:push` applies the migrations.
2. In the Supabase dashboard, open *Authentication → Sign In / Providers* and switch off *Allow new users to sign up*.
3. Create accounts under *Authentication → Users → Add user → Create new user*, with a password of at least 10 characters and *Auto Confirm User* ticked. No email is sent. The trigger creates the profile.
4. Run `supabase/snippets/first-super-admin.sql` once with your address (see "First Super Admin" below).
5. Copy `.env.example` to `.env.local`, then run `npm run dev`. Log in at `http://localhost:3000`.

Do not use *Send invitation* in this setup. Built-in SMTP sends Supabase's default invite email, and its link does not go through `/auth/confirm`. The person ends up on the dashboard without a session and is sent back to `/login`. Built-in SMTP also only delivers to members of the Supabase organisation.

#### Going live

Do this once, before the first real staff member is invited:

1. **Deploy the dashboard.** Fill `.env.local` (it is read at build time), then run `npx wrangler login` and `npm run deploy` (see "Deploy to Cloudflare"). Set the Supabase secret key as a Worker secret with `npx wrangler secret put SUPABASE_SECRET_KEY`; without it, inviting and set-password links fail. Note the dashboard URL.
2. **Point auth links at it.** In `supabase/config.toml`, set `site_url` to the dashboard URL and add `"<dashboard URL>/**"` to `additional_redirect_urls`. Keep `http://localhost:3000/**` if you still want local logins to work. Commit the change.
3. **Push the auth settings with IONOS SMTP.** Set the credentials in your shell; they never go in the repo. Check the diff: it should list only auth settings, the SMTP block and the email templates. Then push:

   ```bash
   export SUPABASE_AUTH_SMTP_USER="<IONOS mailbox address>"
   export SUPABASE_AUTH_SMTP_PASS="<IONOS mailbox password>"
   export SUPABASE_AUTH_SMTP_ADMIN_EMAIL="<sender address, usually the mailbox address>"
   npx supabase config diff
   npx supabase config push
   ```

4. **Test an invite end to end.** In the Supabase dashboard, open *Authentication → Users → Add user → Send invitation* and invite a mailbox you can read. Check that the German email arrives from the IONOS sender, that the link opens `<dashboard URL>/set-password`, and that you can set a password and log in.
5. **Check that sign-up is off.** This call should fail with "Signups not allowed for this instance":

   ```bash
   curl -X POST "https://qhjysorczroizpgmagpp.supabase.co/auth/v1/signup" -H "apikey: <publishable key>" -H "Content-Type: application/json" -d '{"email":"test@example.org","password":"irrelevant-123"}'
   ```

6. **Clean up test accounts.** Delete accounts created during local testing that should not exist in production, under *Authentication → Users*. Their profiles are deleted with them. All data lives in the one cloud project (ADR-0006), so test accounts stay live until someone deletes them.

#### First Super Admin

Run this once, after `npm run db:push` and after the person has an account (created locally as above, or invited once live). Open `supabase/snippets/first-super-admin.sql`, replace the address with theirs and run it in the SQL editor. It returns the promoted row. It does nothing once any Super Admin exists, so whoever you promote during local testing remains the first Super Admin in production. Further Super Admins are appointed from the dashboard (blueprint §2.1), not with this snippet.

### Teams

`public.teams` and `public.team_members` hold who belongs to which team, with one role per team (`team_admin` or `member`). RLS lets people see only their own teams and memberships. Super Admins see all teams, and only they can create and rename teams. After a migration that touches team access, run `supabase/snippets/rls-checklist-teams.sql` in the SQL editor. It checks the rules as different people on throwaway test data, then rolls back. `npm test` runs the same checklist against the migrations.

### Members

Team Admins manage their own team's members on `/teams/[id]`, and Super Admins manage every team's: invite by email, change roles, remove members, and send a set-password link. Everyone else in the team sees the member list without these actions.

- Inviting an address without an account creates the account and sends Supabase Auth's invite email. An existing account is added to the team without an email.
- A set-password link is Supabase Auth's recovery email (`supabase/templates/recovery.html`).
- A team cannot lose its last Team Admin. A database trigger refuses it, unless a Super Admin makes the change.
- Inviting and set-password links need the Supabase secret key (`sb_secret_…`, not the legacy `service_role` key) as `SUPABASE_SECRET_KEY` in `.env.local` (see `.env.example`). Only `lib/supabase/admin.ts` reads it. That file is server-only, and the actions check that the caller may manage the team before they use the key. All membership changes run as the signed-in person, so RLS has the final say.

In the "Current setup: local testing" mode, the emails come from Supabase's built-in SMTP with Supabase's default templates. Those links do not go through `/auth/confirm`, so a newly invited person cannot set a password yet. Adding existing accounts and changing roles work. Invites and set-password links work end to end only after "Going live", step 3.

### Audit log

`public.audit_log` records security-relevant actions: who did what to which entity, in which team, and when. For now these are invites, role changes and removals of members.

- Super Admins read every team's entries on `/audit-log`. Team Admins, and Super Admins too, read a team's entries at the bottom of `/teams/[id]`. Team Members see none.
- Entries are written only by `private.record_audit(team, action, entity_type, entity_id, details)`. Signed-in people and the Data API cannot call it. Triggers and database functions call it, so the entry commits together with the change it records. The actor is always the signed-in person. Without one (service role, SQL editor) the actor is empty and the dashboard shows *System*.
- Nobody can add, edit or delete entries through the Data API, not even with the secret key. A trigger also refuses edits and deletes from the table owner, who would have to drop it on purpose first.
- `details` holds readable context, such as the member's address and role. It never holds submission data.
- The audit log is part of `supabase/snippets/rls-checklist-teams.sql` (checks 16–19, and 9 for anon).

### Global settings

Super Admins change the allowed origins, the allowed recipient domains and both rate limits on `/settings` (rail icon *Einstellungen*, bottom). Everyone else gets "not found". `/load-form` and `/submit-form` read the `public.settings` row on every request, so a saved change applies to the next request, without a redeploy.

- **Allowed origins:** one per line, or separated by commas, semicolons or spaces. The dashboard stores each as browsers send it (lower case, without a default port or trailing slash, international domains in ASCII), each once, at most 100. Paths, wildcards, credentials and IPv6 addresses are refused. An empty list means no site can embed forms.
- **Allowed recipient domains:** every recipient of every form must be on one of these email domains, so submissions cannot be redirected to private mailboxes. One per line, or separated by commas, semicolons or spaces; a leading `@` is dropped. Stored in lower case, each once, at most 100. Only the exact domain counts: `kv.drk-rostock.de` needs its own entry next to `drk-rostock.de`. The list starts as `drk-rostock.de`. An empty list means no form can save recipients or send emails.
  - A database trigger (`private.check_recipient_domains()`) refuses a form's recipient list with an address elsewhere, whoever writes it, with SQLSTATE `HF006` and the first such address as detail; the dashboard names it in German. The check runs only when the list changes, so a form whose domain was removed since keeps its other settings editable.
  - `/dispatch-email` sends only to recipients on the list as it is at delivery (see *Delivering submissions*).
- **Rate limits:** whole numbers from 1 to 100 000. Loads count per minute and IP, submissions per hour and IP.
- The database checks the same rules (`settings_*_check`). RLS lets only Super Admins read and update the row, and only those four columns. Nobody adds or deletes the row through the Data API.
- Each changed setting is recorded in the audit log (`settings.origins_changed`, `settings.recipient_domains_changed`, `settings.load_limit_changed`, `settings.submit_limit_changed`, with old and new value). The entries belong to no team, so only Super Admins see them, on `/audit-log`.
- The settings are part of `supabase/snippets/rls-checklist-teams.sql` (checks 33–35).

### Forms

`public.forms` holds each team's forms: settings that take effect at once (name, recipients, closed, archived and the rest), plus the single draft. Any member of the owning team, and every Super Admin, can create a form and change its name, recipients and bot protection (see *Bot protection* below). `/forms` lists the forms of all your teams, without archived ones; *Archiviert* (`/forms?filter=archived`) lists those. `/forms/[id]` shows a form's settings.

- Creating a form asks which of your teams owns it. A form never moves to another team, and nobody deletes it through the Data API (see *Archiving and deleting forms*).
- Recipients must be lower-case email addresses (the `public.email_address` domain, at most 20 per form) on an allowed recipient domain (see *Global settings*). The dashboard accepts one per line, or separated by commas or semicolons, and stores them lower-case, each once. A new form starts without recipients; they are set afterwards, so every list shows up in the audit log as a change.
- Creating, renaming, recipient changes and switching bot protection are recorded in the audit log by database triggers, with the old and new value.
- Forms are part of `supabase/snippets/rls-checklist-teams.sql` (checks 20–25, plus 4 and 9).

### Publishing

*Veröffentlichen* on `/forms/[id]` freezes the draft's questions and email template into the next row of `public.form_versions` (1, 2, 3, … per form) and makes it the form's current version. Visitors are only ever served the current version.

- Publishing goes only through `public.publish_form(form, changelog)`. It locks the form, inserts the version, moves `forms.current_version` and writes the `form.published` audit entry in one transaction. Members of the form's team and Super Admins may call it; a draft without questions is refused.
- Versions are immutable. Nobody writes `form_versions` through the Data API, not even with the secret key, and triggers refuse edits, deletes and out-of-sequence numbers from the table owner too. Versions go only with their form, when it is deleted for good.
- A new form's draft starts with the default email template: Standard Layout, a greeting and `{{answers_table}}`.
- Publishing is part of `supabase/snippets/rls-checklist-teams.sql` (checks 28–31, plus 9).

### Version history, restoring and discarding

The *Versionen* view of `/forms/[id]` lists every version, newest first, with who published it, when, and its changelog.

- *Wiederherstellen* on a version goes through `public.restore_form_version(form, version)`. It copies the version's questions and email template into the draft and writes `form.version_restored`. Visitors keep the current version until the draft is published, which makes the next version number. A restored version 1 can come back as version 3.
- *Änderungen verwerfen*, next to *Veröffentlichen*, goes through `public.discard_draft_changes(form)`. It resets the draft to the current version and writes `form.draft_discarded`. While the form is not yet published, it is refused, and the button does not show.
- Both lock the form and stamp the draft with the caller, like a draft save. They are open to the same people as publishing, and they never write `form_versions`. Both wait until the editors have saved their last change, and then the designer and the email editor reopen on the replaced draft.
- Both are part of `supabase/snippets/rls-checklist-teams.sql` (checks 36–37, plus 9).

### Closing forms

The *Formular geschlossen* switch in a form's settings sets `forms.is_closed`. It is saved with the other settings, only when it was switched, so a save from a page opened before a colleague closed the form leaves it closed. It takes effect at once, also for visitors who already have the form open. Members of the owning team and Super Admins may switch it.

- `/load-form` answers a closed form with `200 { "state": "closed" }`, without its questions and without counting a load. The embed then shows *Dieses Formular ist derzeit geschlossen. Einsendungen sind im Moment nicht möglich.* An unpublished or archived form is still not found.
- `/submit-form` refuses a closed form with `409 { "error": "form_closed" }`, before Turnstile, validation and queueing. The embed shows its own notice inside the form.
- Submissions accepted before closing are still delivered.
- Closing writes `form.closed`, and reopening writes `form.reopened` (*Formular geschlossen* / *Formular wieder geöffnet* in the audit log).
- Checks 38–39 of `supabase/snippets/rls-checklist-teams.sql` cover it.

### Archiving and deleting forms

*Archivieren und löschen*, below a form's settings, retires a form. Each action confirms in a modal.

- *Archivieren* goes through `public.archive_form(form)`, which sets `forms.archived_at` to now. Archiving again keeps the first time. Members of the owning team and Super Admins may call it. Nobody writes `archived_at` directly.
- An archived form leaves the forms list and shows under *Archiviert*. Its page still opens, with a notice. `/load-form` answers 404 and `/submit-form` answers 404 `form_not_found` (`load_form` and `submission_form` skip archived forms). Its versions, statistics and load counts stay. Submissions accepted before archiving are still delivered.
- *Aus dem Archiv holen* goes through `public.unarchive_form(form)`, open to the same people. The form is served again at once if it is published.
- *Endgültig löschen* shows only to Super Admins. It asks for the form's name and then calls `public.delete_form(form)`, which refuses everyone else. The form goes with its versions, statistics and load counts (foreign keys cascade). Its audit log entries stay. Submissions still queued for it are not delivered: the dispatcher answers 404, and QStash moves them to the DLQ after its retries. No failure alert goes out for them.
- A database trigger writes `form.archived`, `form.unarchived` and `form.deleted` to the audit log, whichever path made the change (*Formular archiviert* / *Formular aus dem Archiv geholt* / *Formular endgültig gelöscht*). The deletion entry keeps the team, so the team's Team Admins still see it.
- Checks 40–42 of `supabase/snippets/rls-checklist-teams.sql` cover it, plus 9 and 24.

### Form passes

A protected form is filled in only with a form pass: a secret in the link `<form page>?form_pass=<secret>`. In a form's settings, *Zugang* switches between *Öffentlich* and *Geschützt* (`forms.access_type`), and *Formularseite* sets the form page (`forms.page_url`, an http or https address). Both are saved with the other settings. A database trigger writes `form.access_changed` and `form.page_changed` to the audit log.

- The *Pässe* view of `/forms/[id]` lists a form's passes, newest first: when and by whom each was created, uses (`1 von 3`), expiry, pass metadata and status (*Gültig*, *Aufgebraucht*, *Abgelaufen*, *Widerrufen*). Secrets and hashes never show.
- *+ Pass anlegen* is there once the form is protected and has a form page. It asks for a use limit (default 1, empty = unlimited), a validity in hours (default 48, empty = no expiry) and optional pass metadata. The dashboard makes a 256-bit secret, sends only its SHA-256 to `public.create_form_pass(form, token_hash, max_uses, expires_at, metadata)`, and shows the link once with a copy button.
- Pass metadata is a flat object of at most 20 string or number values, each at most 500 characters, under keys of letters, digits, `_` and `-` (`lib/shared/form-pass.ts` and `private.is_pass_metadata()`). It must not hold personal data.
- *Widerrufen* on a valid pass goes through `public.revoke_form_pass(pass)`. Revoking cannot be undone.
- `public.form_passes` keeps the hash, use limit, use count, expiry, revocation time, source (`dashboard` or `n8n`), creator and metadata. Members of the form's team and Super Admins read every column but `token_hash` and write only through the two functions, which are open to the same people. Passes go with their form when it is deleted for good.
- A database trigger writes `form_pass.created` (use limit, expiry, source; no hash or metadata) and `form_pass.revoked` (*Pass angelegt* / *Pass widerrufen*).
- `/load-form` checks the pass without consuming it. `/submit-form` atomically reserves one valid use per submission through `public.claim_form_pass(form, token_hash, submission)`. Missing, wrong-form, revoked, expired or exhausted passes get 403 `form_pass_invalid`. Retries with the same submission ID share the reservation. `public.finish_form_pass_claim(submission, accepted)` keeps the use if any attempt published, or returns it once every attempt failed. Both functions are callable only with the secret key. The private reservation table holds only IDs and attempt state, and goes with its pass when the form is deleted.
- Checks 43–44 of `supabase/snippets/rls-checklist-teams.sql` cover it, plus 9.

### Form passes from n8n

For dynamic metadata, encrypted personal prefill, server-enforced locked fields, pass-specific recipients, and the n8n HTTP request setup, see [Personalized form links from n8n](docs/n8n-form-passes.md).

n8n creates form passes with `POST /functions/v1/generate-form-pass` (`supabase/functions/generate-form-pass/`, blueprint §7). It authenticates with one global key, `Authorization: Bearer <N8N_INTEGRATION_KEY>`, never with the secret key (ADR-0005). The function has `verify_jwt = false` and checks the key itself; a missing or wrong key gets 401 `unauthorized`.

- The body is JSON `{ form_id, max_uses?, expires_in_hours?, metadata? }`. `max_uses` defaults to 1, `null` means unlimited, at most 10000. `expires_in_hours` defaults to 48, at most 8760 (a year); every n8n pass expires. `metadata` follows the same rules as in the dashboard. Anything else, including unknown fields, gets 400 `{ error: "request_invalid", field }`.
- The form must be protected: a public form gets 409 `form_not_protected`, an unknown or archived form 404 `form_not_found`.
- The answer is 201 `{ form_pass, expires_at, url? }`, with `Cache-Control: no-store`. `form_pass` is the secret, returned only here; `url` is `<form page>?form_pass=<secret>` and is left out while the form has no form page.
- The function makes the secret like the dashboard and stores only its hash through `public.create_n8n_form_pass(form, token_hash, max_uses, expires_at, metadata)`, which only the secret key can call. The pass has source `n8n` and no creator; the audit log shows it as made by the system. It is listed and revoked in the dashboard like any other.

Set the key once, and give the same value to n8n as a header credential:

```bash
npx supabase secrets set N8N_INTEGRATION_KEY=<output of: openssl rand -base64 32>
```

To rotate it, set a new value and update n8n's credential; requests with the old key fail from then on.

### Loading forms

The embed loads a form with `GET /functions/v1/load-form?form_id=<uuid>` (`supabase/functions/load-form/`). It answers `{ version, schema, access_type }` for the form's current version, plus `turnstile_site_key` when the form has Turnstile on. The anon role has no table access; the function reads with the secret key the runtime injects (ADR-0004).

- Only pages on `public.settings.allowed_origins` may call it. Other origins, and requests without an `Origin` header, get 403 before the form is looked at. The list is read on every request, so a change applies at once. Super Admins change it on `/settings` (see *Global settings* below). Origins must match exactly, as the browser sends them: scheme, host and any port, without a trailing slash.
- More than `settings.load_rate_limit` requests per minute from one IP get 429 `rate_limited` (see *Rate limiting* below).
- An unknown, never published or archived form gets 404. A closed form gets `{ state: "closed" }` (see *Closing forms* above). A protected form requires `form_pass` in the query: the function hashes the secret with SHA-256 and looks up a pass for this form. Missing, unknown, wrong-form, revoked, expired or used-up passes get 403 `form_pass_invalid` without questions. A valid pass returns the current version and counts the load, without increasing the pass's use count.
- Every served load adds one to `public.form_load_counts` for the form and the day (Europe/Berlin).
- Only the secret key can call `public.load_form(form)` and `public.count_form_load(form)`. Besides it, only Super Admins can read `settings`. Check 32 of `supabase/snippets/rls-checklist-teams.sql` verifies that the anon role has no privilege on any table, view or sequence.

### Submitting forms

The embed sends a completed form with `POST /functions/v1/submit-form` (`supabase/functions/submit-form/`), as JSON `{ form_id, version, submission_id, answers, form_pass?, turnstile_token?, honeypot }` (blueprint §4.2). The embed makes one `submission_id` per form load and sends it again on every retry, together with the pass secret from the hosting page's link when present.

- The same allowed origins as `/load-form`. More than `settings.submit_rate_limit` requests per hour from one IP get 429 `rate_limited`. A version of a form that is published and not archived is accepted, older versions too, so a visitor whose form was republished meanwhile can still send it. Anything else gets 404 `form_not_found`. A closed form gets 409 `form_closed`. A protected form needs a valid `form_pass`; otherwise it gets 403 `form_pass_invalid`. A malformed body gets 400 `request_invalid`.
- A body over 64 KB gets 413 `payload_too_large`, counted while it is read. The embed says *Ihre Angaben sind zu umfangreich …*.
- Answers to keys that are not questions of that version are dropped (`lib/shared/answers.ts`). The rest are checked against the version's questions (`lib/shared/answer-validation.ts`), after the Turnstile check: required questions must be answered, and each answer must have the shape its question type stores (text for a comment, a list for checkboxes, and so on). Otherwise the answer is 422 `answers_invalid`, the function logs the question keys (never the answers), and the embed says *Einige Angaben fehlen oder sind ungültig …*. The embed validates with SurveyJS before sending, so only hand-made requests should get here. Required questions that can be hidden or disabled (`visibleIf`, `enableIf`, `visible: false`, `readOnly`, `hideIfChoicesEmpty`, on the question or a panel or page around it), and every required question of a form with a `complete` or `skip` trigger, are not enforced, since only SurveyJS can evaluate those conditions; expressions and question types the check does not know take any answer.
- The function writes a `queued` row to `public.form_stats` under the submission ID. The answers are stored nowhere. It encrypts `{ answers, pass_id }` with AES-256-GCM and publishes only the IDs and the ciphertext to QStash, with the submission ID as deduplication ID and 3 retries (ADR-0001). The ciphertext is bound to the submission, form and version, so it cannot be moved to another message.
- If publishing fails, the answer is 503 `queue_unavailable`; the visitor can send again with the same ID. The pass use and stats row are released once every concurrent attempt failed. A failed attempt keeps another attempt's in-flight or accepted reservation and stats row. Cleanup attempts are independent and best effort during a database outage. Encryption or stats failures also finish the failed attempt. A submission ID whose message QStash has confirmed gets 202 without publishing again. One whose publish was never confirmed (say, recording the message ID failed) is published again, and QStash's deduplication keeps that to one message and the submission-bound reservation keeps it to one use. Pass expiry, revocation and form association still apply to retries; an exhausted pass allows only retries of its reserved submission, and rejects a new submission ID.
- The answer to an accepted submission is 202. The embed then shows SurveyJS's completion text, and otherwise a German error inside the form, which stays open for another try.
- QStash delivers to `/functions/v1/dispatch-email` (see *Delivering submissions* below).

The function needs two secrets, set once with the CLI (they are never in `.env*` files):

```bash
npx supabase secrets set QSTASH_TOKEN=<token from the Upstash console, EU region>
```

```bash
npx supabase secrets set SUBMISSION_ENCRYPTION_KEYS=k1:<output of: openssl rand -base64 32>
```

`SUBMISSION_ENCRYPTION_KEYS` is a comma-separated list of `id:base64key`, each key 32 random bytes. The first key encrypts; all of them decrypt. To rotate, put a new key in front (`k2:<new>,k1:<old>`) and keep the old one for at least the 7 days QStash keeps dead-lettered messages (blueprint §4.5). Only the edge functions hold the keys. QStash's default URL is its EU region; `QSTASH_URL` overrides it, and must stay an EU one (ADR-0002).

### Rate limiting

`/load-form` and `/submit-form` limit each IP with a sliding window in Upstash Redis (EU, ADR-0002), right after the origin check (blueprint §4.1, §4.2). Redis is used for nothing else.

- The limits are `public.settings.load_rate_limit` (default 60 per minute and IP) and `submit_rate_limit` (default 3 per hour and IP), read on every request. The windows are fixed in the handlers. Super Admins change the numbers on `/settings`.
- Every request to `/submit-form` counts, also a retry of the same submission after an error.
- Over the limit, the answer is 429 `rate_limited`, with CORS headers. The embed then shows *Zu viele Versuche …* when loading and *Zu viele Einsendungen …* when sending; the form stays open.
- The IP is the first address in `x-forwarded-for`, which Supabase's edge sets. Loads and submissions count separately (key prefixes `ratelimit:load-form` and `ratelimit:submit-form`). Preflights and refused origins don't count.
- The limit always applies. If Redis fails or does not answer within 2 seconds, the request is refused with 503 `rate_limit_unavailable`, and the embed shows its general error. A Redis outage therefore takes the forms down.

Both functions need the Redis database's REST credentials, from the Upstash console (EU region):

```bash
npx supabase secrets set UPSTASH_REDIS_REST_URL=<REST URL> UPSTASH_REDIS_REST_TOKEN=<REST token>
```

### Bot protection

Each form has *Bot-Schutz (Cloudflare Turnstile)* in its settings, on for new forms (`forms.turnstile_enabled`). It takes effect at once, also for visitors who already loaded the form (blueprint §4.2).

- With it on, `/load-form` adds the widget's `turnstile_site_key`, and the embed loads Cloudflare's script (`https://challenges.cloudflare.com/turnstile/v0/api.js`) and renders the widget under the form. It shows only when Cloudflare needs the visitor to do something (`appearance: interaction-only`). Every *Abschließen* sends the widget's current token, and a failed send gets a new one, since each token is good for one check.
- `/submit-form` checks the token with Cloudflare's siteverify, with the visitor's IP, after the rate limit and the form lookup. No token or a refused one gets 403 `turnstile_invalid`, and the embed says *Die Sicherheitsprüfung ist fehlgeschlagen …*. If Cloudflare cannot tell (unreachable, no answer in 5 s, `internal-error`, a wrong secret), the answer is 503 `turnstile_unavailable` and the embed shows its general error: like the rate limit, the check always applies.
- If the visitor clicks *Abschließen* before the widget has a token, the embed asks them to wait, and sends nothing. If Cloudflare's script cannot load (for example because of the page's Content-Security-Policy) or the widget reports an error (say, a hostname the site key does not allow), it says so.
- Every form, with Turnstile on or off, has a hidden `hfs_check` field outside the SurveyJS questions, which people never see or reach (named so browsers don't autofill it). A request whose `honeypot` is filled gets 202 `accepted`, so bots don't try again, and nothing is verified, queued or sent; the function logs the form ID. It is checked before the form is even looked up.

Both functions need a key from the Turnstile widget in the Cloudflare dashboard (its hostnames: the TYPO3 sites). The site key is public, but is set the same way:

```bash
npx supabase secrets set TURNSTILE_SITE_KEY=<site key> TURNSTILE_SECRET_KEY=<secret key>
```

`/load-form` refuses to start without `TURNSTILE_SITE_KEY`, and `/submit-form` without `TURNSTILE_SECRET_KEY`.

### Delivering submissions

QStash delivers each queued submission to `POST /functions/v1/dispatch-email` (`supabase/functions/dispatch-email/`, blueprint §4.4). Only QStash can call it:

- A request without a valid `Upstash-Signature` for exactly this URL and body gets 401 `signature_invalid`. The function has `verify_jwt = false`, since QStash sends no Supabase JWT.
- It decrypts the answers, then loads the form's name and recipients and the submitted version's questions and email template (`public.dispatch_submission`). Recipients take effect at once, also for submissions already queued; the template is the version's (ADR-0003). An archived form still gets the submissions it accepted. Recipients outside the allowed recipient domains as they are now get nothing; the function logs how many were skipped, not who.
- The shared renderer (`lib/shared/notification.ts`) fills `{{answers.<question>}}`, `{{form.name}}`, `{{submitted_at}}` (de-DE, German time) and `{{answers_table}}`. For a submission with a form pass it also fills `{{pass.<key>}}` from that pass's metadata as it is at delivery (read by `pass_id` from the decrypted payload); a key the pass lacks renders empty, and without a pass the placeholder stays as written. Every inserted value is HTML-escaped; the template's own HTML is trusted. The subject is plain text without the answers table. Other placeholders stay as they are.
- One email goes through Mailjet's Send API v3.1 to the form's recipients on an allowed recipient domain, from `NOTIFICATION_SENDER_EMAIL` with the form's sender display name, or *DRK Rostock Formular-Service* when it has none. If the form has a Reply-To question and its answer is a valid email address, that address is the email's Reply-To. Its Mailjet `CustomID` is the submission ID.
- Then `form_stats.status` becomes `sent`. A redelivery of a submission already `sent` answers 200 without a second email. A submission whose stats row is gone is sent all the same.
- Anything other than 2xx makes QStash retry: 502 `mail_failed` when Mailjet refuses, 404 `form_not_found`, 422 for a form without recipients, one with no recipient on an allowed domain (`recipients_not_allowed`), an unreadable template or a ciphertext that cannot be decrypted, 500 otherwise. After the retries, the message lands in the dead-letter queue (kept 7 days), and QStash calls the failure callback below.
- **Delivery failures** (blueprint §4.5). `/submit-form` publishes each message with `/dispatch-email` as its failure callback. QStash signs the callback like any delivery, so the same signature check applies; the function tells it apart by its body (`sourceBody` holding a queued submission) and never decrypts anything in this mode.
  - `public.record_delivery_failure(submission, form, reason)` marks the row `failed` with a technical reason: our own error code and the last HTTP status, e.g. `mail_failed (HTTP 502)`, only the status for any other answer (`HTTP 546`), or `no_response`. A submission already `sent` stays `sent` and gets no alert. The function is callable only with the secret key.
  - Then one alert goes through Mailjet to the form's team's Team Admins, from `NOTIFICATION_SENDER_EMAIL` as *DRK Rostock Formular-Service*: subject *Zustellung fehlgeschlagen: <form name>*, and the form, team, version, submission time, submission ID and reason in the Standard Layout. Never answers or pass metadata. Its `CustomID` is `failure-<submission ID>`.
  - The answer is 200 `{ "status": "failed" }`. If the alert cannot be sent it is 502 `alert_failed`, so QStash retries the callback, which marks the row again and repeats the alert. A form deleted for good gets 200 `form_not_found` and no alert, and a stats row that is gone still gets the alert (*unbekannt* as the time).
  - Known limits: a team without a Team Admin gets only a log line (the database refuses to remove the last one). If the alert is accepted but its answer is lost, Team Admins may get it twice. If Mailjet stays down through all of the callback's own retries, the row is `failed` but no alert goes out; the callback then sits in the DLQ as its own message. 422 answers still go through all retries before the callback, since QStash's non-retryable 489 was not adopted.

The function needs these secrets besides `SUBMISSION_ENCRYPTION_KEYS` (the same value as for `/submit-form`):

```bash
npx supabase secrets set QSTASH_CURRENT_SIGNING_KEY=<from the Upstash console> QSTASH_NEXT_SIGNING_KEY=<from the Upstash console>
```

```bash
npx supabase secrets set MAILJET_API_KEY=<key> MAILJET_SECRET_KEY=<secret> NOTIFICATION_SENDER_EMAIL=<sender address validated in Mailjet>
```

The sender address must be validated in Mailjet, and its domain needs SPF and DKIM for Mailjet (`.scratch/sender-domain/spec.md`).

### Retrying failed deliveries

The *Fehler* view of `/forms/[id]` lists a form's delivery failures, newest first (blueprint §4.5): submission time and ID, version, reason and status (*Fehlgeschlagen* in red, *Wird erneut zugestellt* in orange). Never answers. Members of the form's team and Super Admins see them; signed-in people read `public.form_stats` through RLS, every column but `qstash_message_id`, and write nothing.

- *Zustellung wiederholen* is offered for 7 days after the failure (`form_stats.failed_at`), while QStash keeps the message in its DLQ. The dashboard server gets the message ID from `public.delivery_retry_message(submission)` and retries it with its own `QSTASH_TOKEN` in one call, `POST /v2/dlq/retry?messageId=<id>` (`lib/forms/dead-letter-queue.ts`). QStash queues a copy with the same encrypted body and failure callback. The dashboard never receives the body, not even encrypted (ADR-0002).
- `public.record_delivery_retry(submission, message)` then sets the row back to `queued` under the new message ID, sets `retried_at`, and writes `delivery.retried` (form name, version, submission time) to the audit log (*Zustellung wiederholt*). The row stays listed as *Wird erneut zugestellt* until `/dispatch-email` marks it `sent`, or `failed` again, which can then be retried again.
- If QStash retried nothing, the message is gone: `public.record_delivery_retry_gone(submission, message)` sets `dlq_gone_at` and writes `delivery.retry_unavailable` (*Zustellung nicht mehr wiederholbar*). The row then explains that the submission cannot be delivered any more. After 7 days the row says so without asking QStash. All three functions are open to the members of the form's team and Super Admins only.
- If QStash or the database fails before the retry, nothing changes and the row shows an error. If the retry is out but cannot be recorded, the row says so: the submission is delivered, but the audit log lacks the retry.
- Known limits: the two record functions trust the dashboard to report what QStash answered. A team member calling them directly through the Data API could mark their own team's failure as retried (it then shows *Wird erneut zugestellt* for good) or as gone. That person is named in the audit log. If a retried copy fails again before the retry is recorded (it takes about 30 minutes of QStash retries), the row stays `queued`.
- Checks 45–46 of `supabase/snippets/rls-checklist-teams.sql` cover it.

The dashboard server needs the QStash token (EU region, the same as for `/submit-form`). Locally in `.env.local`; in production as a Worker secret:

```bash
npx wrangler secret put QSTASH_TOKEN
```

`QSTASH_URL` overrides QStash's default (EU) address, and must stay an EU one (ADR-0002).

### Statistics

The *Statistik* view of `/forms/[id]` (`?view=statistics&period=1|7|30|90`, default 30) shows how a form is doing (blueprint §8). The period is today by hour, or the last 7, 30 or 90 days by day, in Berlin time.

- Tiles: submissions, form loads, conversion (submissions per load) and delivery (sent out of sent plus failed, with both counts). Conversion can exceed 100 % when forms loaded before the period are sent within it.
- Below them: sent, failed and still queued as one bar, a bar chart of submissions per hour or day (hover for the point's sent, failed and loads), and the submissions per form version with their share.
- `public.form_statistics(form, days)` counts it all in the database and returns JSON. It runs as the caller, so RLS decides: members of the form's team and Super Admins get the numbers, everyone else `null`. Signed-in people now also read `public.form_load_counts` through RLS, and write nothing. The anon role still has no access (ADR-0004).
- Loads are counted per day only (`count_form_load`), so the hourly chart has no loads. Today's loads go into the tiles. On the days clocks change, the doubled hour counts once and the skipped hour stays empty.
- Check 47 of `supabase/snippets/rls-checklist-teams.sql` covers it, and check 32 covers anon.

### Embedding forms

The form's **Embed** tab provides this code with its form ID and the dashboard's current origin, a copy button, and the configured form page link. Open the deployed dashboard to copy a script address reachable by visitors.

Editors paste this into a TYPO3 HTML content element (blueprint §6):

```html
<div data-form="<form-uuid>"></div>
<script src="https://<dashboard-domain>/embed.js" defer></script>
```

`embed.js` shows the current version of each `data-form` element's form on the page. It is built from `embed/` (`main.ts` is the entry point) into `public/embed.js`, a single classic script that bundles the SurveyJS form library (with React), its default theme and German texts. `npm run build:embed` builds it, and `npm run dev` and `npm run build` (so also `preview` and `deploy`) run that first. It needs `NEXT_PUBLIC_SUPABASE_URL` at build time, from the environment or `.env.local`, and Node 22.18 or later; the `/load-form` address is compiled in. The built file is not committed. Browsers cache it for 5 minutes (`public/_headers`), so a deploy reaches TYPO3 pages without any change there.

- Several forms on one page each load and fail on their own. Pasting the whole snippet once per form is fine: every form is still shown once. Only elements on the page when it has loaded are filled in, not ones added later by scripts.
- The embed reads `form_pass` from the hosting page's query string and forwards it to `/load-form` and `/submit-form`. An invalid or missing pass for a protected form shows *Dieser Link ist ungültig oder abgelaufen.* Public forms need no pass. Loading consumes no use; only an accepted protected submission does.
- Instead of an empty box, visitors see a German message: while loading, for a form that does not exist or is not published (or an empty `data-form`), and when loading fails, which includes pages whose origin is not allowed and no answer within 15 seconds.
- *Abschließen* sends the answers through `/submit-form` (see *Submitting forms* above). Answers to questions the visitor hid again are cleared and not sent.
- The form uses SurveyJS's default theme inside the TYPO3 page. Page CSS for bare `input` or `button` elements can still reach into it.

For TYPO3 admins:

1. Add the site's origin to the allowed origins (see *Loading forms* above), e.g. `https://www.drk-rostock.de`. Without it, the form shows the loading error.
2. If the site sends a Content-Security-Policy, it must allow:
   - `script-src https://<dashboard-domain>`, for `embed.js`;
   - `connect-src https://qhjysorczroizpgmagpp.supabase.co`, for `/load-form` and `/submit-form`;
   - `script-src https://challenges.cloudflare.com` and `frame-src https://challenges.cloudflare.com`, for Turnstile (see *Bot protection* above).

   Nothing else: the theme is added as a constructed stylesheet, so `style-src` needs no `'unsafe-inline'`, and the form loads no fonts or images. Browsers without constructed stylesheets (before Safari 16.4) fall back to a `<style>` element, which a `style-src` without `'unsafe-inline'` blocks; the form then shows unstyled.

### Deploy to Cloudflare

The dashboard runs as a Cloudflare Worker built with OpenNext (`wrangler.jsonc`, `open-next.config.ts`). Log in once per machine with `npx wrangler login`, then:

```bash
npm run deploy
```

`npm run preview` builds the worker and serves it locally through Wrangler. On Windows, stop `npm run dev` first: its Cloudflare dev proxy locks `.open-next/assets` and the build fails with `EBUSY`.

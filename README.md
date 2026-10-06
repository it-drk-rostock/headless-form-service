This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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

### Forms

`public.forms` holds each team's forms: settings that take effect at once (name, recipients, and later closed, archived and the rest), plus the single draft. Any member of the owning team, and every Super Admin, can create a form and change its name and recipients. `/forms` lists the forms of all your teams, without archived ones. `/forms/[id]` shows a form's settings.

- Creating a form asks which of your teams owns it. A form never moves to another team, and nobody deletes it through the Data API.
- Recipients must be lower-case email addresses (the `public.email_address` domain, at most 20 per form). The dashboard accepts one per line, or separated by commas or semicolons, and stores them lower-case, each once. A new form starts without recipients; they are set afterwards, so every list shows up in the audit log as a change.
- Creating, renaming and recipient changes are recorded in the audit log by database triggers, with the old and new value.
- Forms are part of `supabase/snippets/rls-checklist-teams.sql` (checks 20–25, plus 4 and 9).

### Publishing

*Veröffentlichen* on `/forms/[id]` freezes the draft's questions and email template into the next row of `public.form_versions` (1, 2, 3, … per form) and makes it the form's current version. Visitors are only ever served the current version.

- Publishing goes only through `public.publish_form(form, changelog)`. It locks the form, inserts the version, moves `forms.current_version` and writes the `form.published` audit entry in one transaction. Members of the form's team and Super Admins may call it; a draft without questions is refused.
- Versions are immutable. Nobody writes `form_versions` through the Data API, not even with the secret key, and triggers refuse edits, deletes and out-of-sequence numbers from the table owner too. Versions go only with their form, when it is deleted for good.
- A new form's draft starts with the default email template: Standard Layout, a greeting and `{{answers_table}}`.
- Publishing is part of `supabase/snippets/rls-checklist-teams.sql` (checks 28–31, plus 9).

### Loading forms

The embed loads a form with `GET /functions/v1/load-form?form_id=<uuid>` (`supabase/functions/load-form/`). It answers `{ version, schema, access_type }` for the form's current version. The anon role has no table access; the function reads with the secret key the runtime injects (ADR-0004).

- Only pages on `public.settings.allowed_origins` may call it. Other origins, and requests without an `Origin` header, get 403 before the form is looked at. The list is read on every request. Until the settings page exists (ticket 20), change it in the SQL editor: `update public.settings set allowed_origins = array['http://localhost:3000', 'https://www.drk-rostock.de'];`. Origins must match exactly, as the browser sends them: scheme, host and any port, without a trailing slash.
- An unknown, never published or archived form gets 404. A protected form gets 403 without its questions, until form passes are checked (ticket 26).
- Every served load adds one to `public.form_load_counts` for the form and the day (Europe/Berlin).
- Only the secret key can call `public.load_form(form)` and `public.count_form_load(form)` and read `settings`. Check 32 of `supabase/snippets/rls-checklist-teams.sql` verifies that the anon role has no privilege on any table, view or sequence.

### Submitting forms

The embed sends a completed form with `POST /functions/v1/submit-form` (`supabase/functions/submit-form/`), as JSON `{ form_id, version, submission_id, answers }` (blueprint §4.2). The embed makes one `submission_id` per form load and sends it again on every retry.

- The same allowed origins as `/load-form`. A version of a form that is published and not archived is accepted, older versions too, so a visitor whose form was republished meanwhile can still send it. Anything else gets 404 `form_not_found`. A protected form gets 403 `form_pass_invalid` until passes are claimed (ticket 27). A malformed body gets 400 `request_invalid`.
- Answers to keys that are not questions of that version are dropped (`lib/shared/answers.ts`).
- The function writes a `queued` row to `public.form_stats` under the submission ID. The answers are stored nowhere. It encrypts `{ answers, pass_id }` with AES-256-GCM and publishes only the IDs and the ciphertext to QStash, with the submission ID as deduplication ID and 3 retries (ADR-0001). The ciphertext is bound to the submission, form and version, so it cannot be moved to another message.
- If publishing fails, the row is removed and the answer is 503 `queue_unavailable`; the visitor can send again with the same ID. A submission ID whose message QStash has confirmed gets 202 without publishing again. One whose publish was never confirmed (say, the row could not be removed) is published again, and QStash's deduplication keeps that to one message.
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

### Delivering submissions

QStash delivers each queued submission to `POST /functions/v1/dispatch-email` (`supabase/functions/dispatch-email/`, blueprint §4.4). Only QStash can call it:

- A request without a valid `Upstash-Signature` for exactly this URL and body gets 401 `signature_invalid`. The function has `verify_jwt = false`, since QStash sends no Supabase JWT.
- It decrypts the answers, then loads the form's name and recipients and the submitted version's questions and email template (`public.dispatch_submission`). Recipients take effect at once, also for submissions already queued; the template is the version's (ADR-0003). An archived form still gets the submissions it accepted.
- The shared renderer (`lib/shared/notification.ts`) fills `{{form.name}}`, `{{submitted_at}}` (de-DE, German time) and `{{answers_table}}`. Every inserted value is HTML-escaped; the template's own HTML is trusted. The subject is plain text without the answers table. Other placeholders stay as they are until tickets 17 and 28.
- One email goes through Mailjet's Send API v3.1 to all of the form's recipients, from `NOTIFICATION_SENDER_EMAIL` with the name *DRK Rostock Formular-Service* (the form's own sender name comes with ticket 19). Its Mailjet `CustomID` is the submission ID.
- Then `form_stats.status` becomes `sent`. A redelivery of a submission already `sent` answers 200 without a second email. A submission whose stats row is gone is sent all the same.
- Anything other than 2xx makes QStash retry: 502 `mail_failed` when Mailjet refuses, 404 `form_not_found`, 422 for a form without recipients, an unreadable template or a ciphertext that cannot be decrypted, 500 otherwise. After the retries, the message lands in the dead-letter queue; marking it failed is ticket 30.

The function needs these secrets besides `SUBMISSION_ENCRYPTION_KEYS` (the same value as for `/submit-form`):

```bash
npx supabase secrets set QSTASH_CURRENT_SIGNING_KEY=<from the Upstash console> QSTASH_NEXT_SIGNING_KEY=<from the Upstash console>
```

```bash
npx supabase secrets set MAILJET_API_KEY=<key> MAILJET_SECRET_KEY=<secret> NOTIFICATION_SENDER_EMAIL=<sender address validated in Mailjet>
```

The sender address must be validated in Mailjet, and its domain needs SPF and DKIM for Mailjet (`.scratch/sender-domain/spec.md`).

### Embedding forms

Editors paste this into a TYPO3 HTML content element (blueprint §6):

```html
<div data-form="<form-uuid>"></div>
<script src="https://<dashboard-domain>/embed.js" defer></script>
```

`embed.js` shows the current version of each `data-form` element's form on the page. It is built from `embed/` (`main.ts` is the entry point) into `public/embed.js`, a single classic script that bundles the SurveyJS form library (with React), its default theme and German texts. `npm run build:embed` builds it, and `npm run dev` and `npm run build` (so also `preview` and `deploy`) run that first. It needs `NEXT_PUBLIC_SUPABASE_URL` at build time, from the environment or `.env.local`, and Node 22.18 or later; the `/load-form` address is compiled in. The built file is not committed. Browsers cache it for 5 minutes (`public/_headers`), so a deploy reaches TYPO3 pages without any change there.

- Several forms on one page each load and fail on their own. Pasting the whole snippet once per form is fine: every form is still shown once. Only elements on the page when it has loaded are filled in, not ones added later by scripts.
- Instead of an empty box, visitors see a German message: while loading, for a form that does not exist or is not published (or an empty `data-form`), and when loading fails, which includes pages whose origin is not allowed and no answer within 15 seconds.
- *Abschließen* sends the answers through `/submit-form` (see *Submitting forms* above). Answers to questions the visitor hid again are cleared and not sent.
- The form uses SurveyJS's default theme inside the TYPO3 page. Page CSS for bare `input` or `button` elements can still reach into it.

For TYPO3 admins:

1. Add the site's origin to the allowed origins (see *Loading forms* above), e.g. `https://www.drk-rostock.de`. Without it, the form shows the loading error.
2. If the site sends a Content-Security-Policy, it must allow:
   - `script-src https://<dashboard-domain>`, for `embed.js`;
   - `connect-src https://qhjysorczroizpgmagpp.supabase.co`, for `/load-form` and `/submit-form`.

   Nothing else: the theme is added as a constructed stylesheet, so `style-src` needs no `'unsafe-inline'`, and the form loads no fonts or images. Browsers without constructed stylesheets (before Safari 16.4) fall back to a `<style>` element, which a `style-src` without `'unsafe-inline'` blocks; the form then shows unstyled. Turnstile (ticket 15) will add `https://challenges.cloudflare.com` to `script-src` and `frame-src`.

### Deploy to Cloudflare

The dashboard runs as a Cloudflare Worker built with OpenNext (`wrangler.jsonc`, `open-next.config.ts`). Log in once per machine with `npx wrangler login`, then:

```bash
npm run deploy
```

`npm run preview` builds the worker and serves it locally through Wrangler. On Windows, stop `npm run dev` first: its Cloudflare dev proxy locks `.open-next/assets` and the build fails with `EBUSY`.

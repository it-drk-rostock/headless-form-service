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

`npm test` runs every `*.test.ts` under `app/`, `lib/`, `supabase/functions/` and `supabase/tests/`. `npm run typecheck` covers everything except the Deno entry points.

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

### Deploy to Cloudflare

The dashboard runs as a Cloudflare Worker built with OpenNext (`wrangler.jsonc`, `open-next.config.ts`). Log in once per machine with `npx wrangler login`, then:

```bash
npm run deploy
```

`npm run preview` builds the worker and serves it locally through Wrangler. On Windows, stop `npm run dev` first: its Cloudflare dev proxy locks `.open-next/assets` and the build fails with `EBUSY`.

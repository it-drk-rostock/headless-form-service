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

#### Auth settings and emails

Auth settings live in `supabase/config.toml`: sign-up is off, the minimum password length is 10 and auth emails go through IONOS SMTP with the German templates in `supabase/templates/`. The SMTP credentials are never in the repo. Set them in your shell, preview the change, then push it:

```bash
export SUPABASE_AUTH_SMTP_USER="<IONOS mailbox address>"
export SUPABASE_AUTH_SMTP_PASS="<IONOS mailbox password>"
export SUPABASE_AUTH_SMTP_ADMIN_EMAIL="<sender address, usually the mailbox address>"
npx supabase config diff
npx supabase config push
```

`site_url` (`http://localhost:3000`) is the base of every link in auth emails. Before the first real invite, set it to the deployed dashboard URL and add that URL with `/**` to `additional_redirect_urls`, then push again.

The other values in `config.toml` mirror the cloud project. Run `npx supabase config diff` before every push, so that only intended changes are applied.

Accepted limitations:

- Supabase cannot switch off its public password-recovery endpoint. Someone who calls the API directly can still have a set-password link sent to their own mailbox. The dashboard offers no way to do this.
- `/set-password` changes the password of whoever is signed in, without asking for the current password. This is the same trust a valid session already has.

#### First Super Admin

Do this once, after `npm run db:push`:

1. Make sure `site_url` points at the deployed dashboard (see above). Otherwise the invite link leads to `localhost`.
2. In the Supabase dashboard, open *Authentication → Users → Add user → Send invitation* and invite the first person. The invite arrives through IONOS. They follow the link and set a password.
3. Open `supabase/snippets/first-super-admin.sql`, replace the address with theirs and run it in the SQL editor. It returns the promoted row. It does nothing once any Super Admin exists.

Further Super Admins are appointed from the dashboard (blueprint §2.1), not with this snippet.

### Deploy to Cloudflare

The dashboard runs as a Cloudflare Worker built with OpenNext (`wrangler.jsonc`, `open-next.config.ts`). Log in once per machine with `npx wrangler login`, then:

```bash
npm run deploy
```

`npm run preview` builds the worker and serves it locally through Wrangler. On Windows, stop `npm run dev` first: its Cloudflare dev proxy locks `.open-next/assets` and the build fails with `EBUSY`.

# 03: Invite-only login

**What to build:** Staff log in to the dashboard with email and password. Nobody can sign up on their own. The first Super Admin is bootstrapped once. Auth emails (invites, set-password links) go through IONOS SMTP configured as Supabase custom SMTP. There is no self-service password reset and no MFA.

**Blocked by:** 01 (Backend tooling), 02 (Dashboard shell)

**Status:** ready-for-human

- [ ] A `profiles` row exists for each auth user (email, full name, `is_super_admin`)
- [ ] Public sign-up is disabled in Supabase Auth
- [x] Signed-out visitors to any dashboard page are redirected to the login page
- [x] A documented one-time step makes the first person a Super Admin
- [ ] Supabase Auth sends emails through IONOS SMTP (credentials configured as secrets, not in the repo)
- [x] The login page has no 'forgot password' link

## Comments

**2026-10-04, agent:** Repo side done. Three criteria are met. The other three need a human, because they change the live cloud project (ADR-0006) or need the IONOS password.

- **Profiles:** migration `supabase/migrations/20261004153803_profiles.sql`. It adds `public.profiles` as in blueprint §3, with a trigger on `auth.users` that creates the row and keeps the email in sync, and a backfill of existing users. RLS lets people see their own profile and lets Super Admins see all (`private.is_super_admin()`, security definer in an unexposed schema). `anon` has no access (ADR-0004), and `authenticated` can only `select`. Docker isn't running here, so `supabase/tests/` applies the migrations to an in-memory PGlite against a stub of Supabase's roles and `auth.users`. The 10 tests cover the trigger, email sync, cascade, RLS, anon denial, no self-promotion, and the bootstrap snippet.
- **Login:** `proxy.ts` (Next 16 proxy) refreshes the session with `getClaims()` and sends signed-out visitors to `/login?next=…`. `next` is checked against open redirects; the tab and newline tricks are covered by tests. `requireProfile()` in the dashboard layout is the authoritative check. A token without a profile goes to `/auth/signout`. `/login` is email and password only, with no reset link, just a hint to ask an admin. Invite and set-password links land on `/auth/confirm` (`token_hash`, types `invite` and `recovery` only), then `/set-password`. The rail now has the avatar with *Abmelden* (ui-design §4).
- **Auth config:** `supabase/config.toml` turns sign-up off, sets the minimum password length to 10, turns TOTP MFA off, adds IONOS SMTP with `env(SUPABASE_AUTH_SMTP_*)`, and adds German invite and recovery templates. Links stay valid for 24 hours. `supabase config diff` against the cloud showed that local defaults would have changed unrelated settings (pooler, storage analytics, OTP length, confirmations). I aligned those with the cloud values, so a push only changes auth settings.
- **Checks:** `npm test` passes (34 tests), as do `npm run typecheck` and Biome on the changed files. `opennextjs-cloudflare build` succeeds. It warns that Node proxy support on Cloudflare is experimental. `wrangler dev` on the built worker redirected signed-out requests correctly and rendered `/login`. In `npm run dev` the login page rendered with no console errors. I could not test a successful login, because no account exists yet and the migration isn't pushed.
- **Review:** I ran a two-axis review. I fixed an open redirect through tab characters in `?next=`, the unescaped dots in the proxy matcher, the 500 on a missing profile, the link-error alert without an icon, and the duplicated logo tile and form alert. I also documented the limitations below.

For the human, in this order:

1. `npm run db:push` applies the profiles migration. Check with `npx supabase migration list`.
2. Set `site_url` in `supabase/config.toml` to the deployed dashboard URL, and add `<url>/**` to `additional_redirect_urls`. Otherwise invite links point at localhost.
3. Export `SUPABASE_AUTH_SMTP_USER`, `SUPABASE_AUTH_SMTP_PASS` and `SUPABASE_AUTH_SMTP_ADMIN_EMAIL` (IONOS mailbox). Then run `npx supabase config diff`: it should list only the auth changes. Then run `npx supabase config push`. Criteria 2 and 5 are met after this step.
4. Redeploy the dashboard (`npm run deploy`). It needs `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` at build time; see `.env.example`.
5. Follow README "First Super Admin": invite yourself from the Supabase dashboard, check that the mail arrives via IONOS, set a password, then run `supabase/snippets/first-super-admin.sql`. Log in, and check that the avatar menu signs you out. Criterion 1 is met after this step.
6. Optional: run `curl -X POST https://qhjysorczroizpgmagpp.supabase.co/auth/v1/signup` with the publishable key and any email and password. Expect "Signups not allowed".

Open points for the reviewer:

- Supabase's public `/recover` endpoint can't be switched off. Anyone can still trigger a set-password mail to their own mailbox through the API, though not through the UI. `/set-password` doesn't ask for the current password. Both are documented in the README as accepted limitations.
- The login hint says a Team-Admin or Super Admin can send a new link. That action arrives with ticket 05.
- Node proxy on OpenNext/Cloudflare is marked experimental. It worked under `wrangler dev`.
- The blueprint §9 env var is now `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (publishable key instead of the legacy anon key).
- A local `.env.local` (gitignored) holds the publishable key for `npm run dev`.

# 05: Membership management

**What to build:** Team Admins (and Super Admins) manage who is in their team: invite people by email, change roles, remove members, and send a new set-password link to someone who forgot their password. A team can never lose its last Team Admin. One person can belong to several teams.

**Blocked by:** 04 (Teams)

**Status:** ready-for-human

- [ ] Inviting an email creates the account if needed and sends an invite via IONOS SMTP; existing accounts are simply added
- [x] Team Admins can change roles and remove members of their own team only
- [x] Removing or demoting the last Team Admin is blocked (a Super Admin can override)
- [ ] Admins can send a set-password link to a member
- [x] Team Members see the member list but no management actions
- [x] Operations needing the service-role key run only on the dashboard server

## Comments

**2026-10-05, agent:** Repo side done. Four criteria are met. The other two (1: invite email, 4: set-password link) are built, but they can only be checked once the migration is pushed and the auth emails go through IONOS. That needs a human (ADR-0006).

- **Database:** migration `supabase/migrations/20261005140000_memberships.sql`.
  - `authenticated` may insert and delete memberships, and update only `role`. Moving a membership to another team is refused.
  - Policies allow writes for Super Admins and for Team Admins of that team (`private.is_team_admin`).
  - A new profiles policy (`private.shares_team_with`) lets people see the names and addresses of their teammates, which the member list needs.
  - The trigger `keep_last_team_admin` refuses to demote or remove a team's last Team Admin, with SQLSTATE `HF001`.
    - It runs after the statement, so removing every Team Admin at once is caught.
    - It locks the team row, so two Team Admins cannot demote each other at the same time.
    - It lets through Super Admins (the override), requests without a signed-in person (service role, SQL editor), and memberships that disappear because a team or account is deleted.
- **Dashboard:** `/teams/[id]` now has a *Mitglieder* table with name, address, role and *Mitglied seit*. Team Admins of the team and Super Admins also get:
  - *+ Mitglied einladen*, a drawer with address, an optional name and the role.
  - A `⋯` menu per row with *Zum Team-Admin machen* / *Zum Mitglied machen*, *Link zum Passwort senden* and *Aus dem Team entfernen*. Each one is confirmed in a modal.

  For the last Team Admin, the modal explains the rule instead of offering the action. A Super Admin gets an orange warning and may go ahead. Team Members see the table only. Someone who removes themselves lands on `/teams`.
- **Invite flow:** `lib/members/invite.ts` is the tested orchestration.
  - It looks for an account by exact address. If there is none, it creates one with `auth.admin.inviteUserByEmail`, which sends Supabase Auth's invite email. That goes through IONOS once `config.toml` is pushed.
  - An existing account is added without an email.
  - If someone invites the same address at the same moment, the account is simply added.
- **Set-password link:** `auth.resetPasswordForEmail`, sent only to members of the team, with the address read from the database. The 24-hour link goes through `/auth/confirm` to `/set-password`.
- **Service role:** only `lib/supabase/admin.ts` (`server-only`) reads the secret key (`SUPABASE_SECRET_KEY`). The key is used only after the action has checked that the caller is a Team Admin of the team or a Super Admin. Membership writes always run as the signed-in person, so RLS and the trigger have the final say. The built client bundles don't contain the key or the admin calls.
- **RLS checklist:** `supabase/snippets/rls-checklist-teams.sql` now has 15 checks, including the membership writes, profile visibility and the last Team Admin. A new test shows that it fails when the trigger is missing.
- **Checks:**
  - `npm test` passes: 85 tests. New are 17 DB tests, 4 invite-flow tests and 3 email tests, and one ticket-04 test was updated for the new grants.
  - `npm run typecheck` and `next build` pass.
  - Biome is clean on the changed files. Its only errors are in the unrelated `.agents/skills/setup-ts-deep-modules/` file.
  - I could not test the pages in a browser: they need an account, and the migration isn't on the cloud project yet.
- **Review:** I ran a two-axis review and fixed what it found:
  - The account lookup used `ilike`, where PostgREST reads `*` as a wildcard. A crafted `*@drk-rostock.de` could have added someone else's account. It is now an exact match.
  - The glossary's *Team Admin* now lists all their rights.
  - Plus a shared `memberName`, `isTeamRole` next to `TeamRole`, an icon on the remove button, and less duplication.

For the human, in this order:

1. `npm run db:push` applies the memberships migration.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 15 of 15 checks`.
3. Add `SUPABASE_SECRET_KEY` to `.env.local`. Use the secret key (`sb_secret_…`) from *Project Settings → API Keys*, not the legacy `service_role` key. Then restart `npm run dev`.
4. As Super Admin, on a team's page:
   - Invite an **existing** account (created as in README "Current setup"). Expect *…wurde ohne E-Mail zum Team hinzugefügt*.
   - Make it Team-Admin, then make yourself or it a member again.
   - Log in as that account and check that it can manage the team, but cannot demote itself while it is the last Team Admin.
   - As a plain member, check that there is no *Mitglied einladen* and no `⋯` menu.
5. Criteria 1 and 4: after README "Going live" (IONOS `config push`, and on Cloudflare `wrangler secret put SUPABASE_SECRET_KEY`):
   - Invite a new address you can read, and check that the German invite arrives from IONOS and leads to `/set-password`.
   - Send yourself *Link zum Passwort senden*.

   With built-in SMTP, both emails arrive with Supabase's default templates, whose links don't go through `/auth/confirm` (README "Members").

Open points for the reviewer:

- **Orphan accounts.** If adding the membership fails after the invite email went out, the account exists in no team. The action checks the caller's rights first, so this needs a race or an outage. Inviting the address again adds the account.
- **Account existence.** A Team Admin learns whether an address already has an account (*Einladung gesendet* vs *hinzugefügt*). They can also add any existing account, including a Super Admin, without that person being told. The ticket asks for existing accounts to be "simply added", so I kept it.
- **Set-password links use Supabase's public recovery endpoint.** That endpoint can't be switched off anyway (README, accepted limitation). Avoiding it would need a mail sender outside Supabase Auth, which contradicts blueprint §2.3.
- **The trigger trusts calls without a signed-in person.** Any future code must not write `team_members` with the service-role client. `lib/supabase/admin.ts` says so.
- **Beyond the criteria:** the optional name on invite, the *Sie* badge, the redirect after removing yourself, and the *no Team Admin* notice for Super Admins. Membership changes are not audited yet; that is ticket 06.
- **Test seams.** The DB (as each role), the invite flow with fakes, and the email helper. These are the seams the repo already uses; I did not agree them beforehand.

**2026-10-05, human + agent:** The human pointed out that Supabase now calls `service_role` a legacy key. Supabase's docs deprecate it by the end of 2026 and recommend the secret key (`sb_secret_…`) as `SUPABASE_SECRET_KEY`. The variable is renamed to that in `lib/supabase/admin.ts`, `.env.example`, README and blueprint §9; the code was already compatible with secret keys. A secret key still acts as the `service_role` Postgres role, so the prose about that role stays. Secret keys also refuse requests that look like they come from a browser, an extra safeguard on top of `server-only`.

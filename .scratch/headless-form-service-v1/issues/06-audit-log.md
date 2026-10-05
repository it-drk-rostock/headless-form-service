# 06: Audit log

**What to build:** Security-relevant actions are recorded and visible: Team Admins see their team's entries, Super Admins see everything. This ticket adds the recording helper later tickets use and instruments membership and role changes.

**Blocked by:** 05 (Membership management)

**Status:** ready-for-human

- [x] `audit_log` table: team, actor, action, entity type/id, details, timestamp; details never contain submission data
- [x] One shared helper records entries; invites, removals and role changes use it
- [x] Team Admins see their team's log; Super Admins see all; Team Members see none
- [x] Entries cannot be edited or deleted through the dashboard

## Comments

**2026-10-05, agent:** Repo side done. All four criteria are met and tested against the migrations (PGlite). They still need the migration pushed and the cloud RLS checklist run, which needs a human (ADR-0006).

- **Database:** migration `supabase/migrations/20261005170000_audit_log.sql`.
  - `public.audit_log` has the columns from blueprint §3. It adds `actor_email`, the actor's address at the moment they acted, because Team Admins cannot see the profiles of Super Admins or of former members.
  - `details` must be a JSON object. Membership entries hold the member's address and role(s), never submission data.
  - There are no foreign keys, so entries outlive the team, account or entity they name, and no cascade ever rewrites them.
  - RLS: Super Admins see everything, Team Admins see the rows of teams where they are Team Admin, and Team Members and anon see nothing.
  - Only `select` is granted, to `authenticated`. All rights are revoked from `anon`, `authenticated` and `service_role`. A statement trigger (`HF002`) also refuses update, delete and truncate by the table owner.
- **Helper:** `private.record_audit(team, action, entity_type, entity_id, details)` is the only writer.
  - The actor always comes from `auth.uid()`, never from the caller. Without a signed-in person (service role, SQL editor, Supabase Auth) there is no actor, and the dashboard shows *System*.
  - Signed-in people and the Data API cannot call it. Triggers and security definer functions call it, so the entry commits together with the change, or neither does.
- **Membership changes:** triggers on `team_members` record `member.added` (invite or add), `member.role_changed` (only when the role really changes, with `from`/`to`) and `member.removed`. They catch every path, including the invite flow from ticket 05. A change refused by the last-Team-Admin guard leaves no entry.
- **Dashboard:**
  - `/audit-log` is for Super Admins only, with a rail icon *Audit-Log* (ui-design §4). Everyone else gets "not found".
  - It shows every team's entries, newest first, 50 per page (`?seite=`), with the columns time, team, actor, action and details.
  - Team Admins and Super Admins also see an *Audit-Log* section at the bottom of `/teams/[id]` with that team's entries. Team Members don't see it.
  - Nothing in the dashboard can edit or delete entries.
- **RLS checklist:** `supabase/snippets/rls-checklist-teams.sql` now has 19 checks:
  - 16: members see nothing.
  - 17: a Team Admin sees their own team's entries, including the role changes from check 12, and nothing of other teams.
  - 18: no writes.
  - 19: a Super Admin sees all.
  - 9: anon can't read.

  Two new tests show the checklist fails on a leaking policy and on a missing trigger.
- **Checks:**
  - `npm test` passes: 118 tests. New are 17 DB tests, 7 for describe and pages, and 4 for navigation, i18n and the checklist.
  - `npm run typecheck`, `next build` and Biome on the changed paths pass.
  - The `auth.uid()` stub in `supabase/tests/database.ts` now handles empty claims, as Supabase does.
  - Not tested in a browser: the pages need an account, and the migration isn't on the cloud project yet.
- **Review:** two-axis review, no missing criteria and no hard violations. Fixed:
  - One action map instead of a switch.
  - The shared `AuditLog` component moved to `app/_components`.
  - The pager past the last page now leads back.
  - Paging on the team page keeps `#audit-log`.
  - `queryAs` and `commitAs` share one helper.
  - README wording.
  - New glossary term *Audit Log*.

For the human, in this order:

1. Run `npm run db:push`, which applies the audit log migration.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 19 of 19 checks`.
3. As Super Admin, on a team's page, add an existing account, make it Team-Admin, then make it a member again. Check that:
   - The *Audit-Log* section at the bottom shows the three entries, newest first, with you as actor.
   - `/audit-log` (rail icon) shows them with the team name.
4. Log in as a Team Admin of that team. Check that:
   - The team page shows its log.
   - There is no rail icon, and `/audit-log` is not found.
   - As a plain member, there is no log section.
5. Optional: in the SQL editor, `update public.audit_log set action = 'x'` should fail with `audit_log is append-only`.

Open points for the reviewer:

- **Writers in later tickets.** The helper only takes the actor from `auth.uid()`. Audited actions must therefore run as the signed-in person, via a trigger or a security definer function. If ticket 31's retry or ticket 29's n8n pass creation runs with the secret key, the entry shows *System*. That is right for n8n, but for a retry the clicking person would be lost. That ticket would need a vetted way to pass the actor, or a public RPC that checks the caller.
- **Deleting a team or account.** The cascade writes one `member.removed` per membership, by whoever deleted. After that, only Super Admins see the entries, because nobody is Team Admin of a deleted team. After an account deletion the entry has no address, since the profile is already gone; the dashboard shows *Gelöschtes Konto*. Neither can be done in the dashboard yet.
- **Not audited yet:** set-password links (Supabase Auth, outside the database), and creating or renaming teams. The blueprint's list doesn't name them. Each is a small trigger or call if you want them.
- **Personal data.** Entries keep the addresses of actor and member indefinitely, by design for an audit trail. There is no retention or deletion yet; it would need the append-only trigger dropped on purpose.
- **Beyond the criteria:** `actor_email`, paging, and the log section on the team page (blueprint §10 lists only the Super Admin audit log route, but §2.1 gives Team Admins their team's log).
- **Test seams.** The DB as each role, plus pure helpers for wording, paging and navigation. These are the seams the repo already uses; I did not agree them beforehand.

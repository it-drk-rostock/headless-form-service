# 04: Teams

**What to build:** A Super Admin creates and renames teams. People see the teams they belong to at `/teams` and a team's details at `/teams/[id]`. Row-level security keeps everyone except Super Admins inside their own teams.

**Blocked by:** 03 (Invite-only login)

**Status:** ready-for-human

- [x] `teams` and `team_members` tables with role `team_admin` | `member`; unique (team, person)
- [x] Super Admins can create and rename teams; others cannot
- [x] `/teams` lists only my teams (all teams for a Super Admin)
- [x] `/teams/[id]` of a team I don't belong to is not accessible
- [ ] RLS enforces team boundaries with the Super Admin bypass; a manual RLS checklist is written and run with a test team

## Comments

**2026-10-05, agent:** Repo side done. Four criteria are met. The fifth (RLS checklist run with a test team) is written and passes against the migrations, but it still needs one run on the cloud project after `db:push`, which needs a human (ADR-0006).

- **Schema:** migration `supabase/migrations/20261005093000_teams.sql` adds `public.teams` (name 1–100 characters after trimming, `updated_at` trigger) and `public.team_members` with the enum `team_role` (`team_admin` | `member`). The primary key `(team_id, user_id)` gives "unique (team, person)", and both foreign keys cascade (blueprint §3). `anon` has no access (ADR-0004). `authenticated` may select and insert teams, may update only `name`, and may only select memberships. Membership writes come with ticket 05.
- **RLS:** a new `private.is_team_member(team)` (security definer, empty `search_path`, answers only for `auth.uid()`) joins the existing `private.is_super_admin()`. You see a team and its memberships when you are a member or a Super Admin. Only Super Admins may create and rename teams; for a Team Admin a rename matches no rows.
- **Pages:** `/teams` lists the teams that RLS returns, so a person gets their own teams and a Super Admin gets all of them. The table shows name, own role (*Kein Mitglied* for a Super Admin outside the team) and creation date. Super Admins get *+ Team anlegen* (right-hand drawer); after creating a team they land on its page. `/teams/[id]` shows the name, the ID in monospace, the own role, the member count and the creation date. Super Admins also get *Umbenennen*. A team you cannot see, or a malformed ID, gives the same *Team nicht gefunden* page, so IDs reveal nothing. The sidebar's *TEAMS* section and the breadcrumbs now show the person's teams. Server actions in `lib/teams/actions.ts` use the signed-in client, never the service role, so RLS is the real check.
- **RLS checklist:** `supabase/snippets/rls-checklist-teams.sql`, nine checks run as Super Admin, Team Admin, two members of different teams and anon. It creates its own test users and two test teams inside a transaction and rolls everything back. `npm test` runs it against the migrations. It passes, and a test with a deliberately leaky policy shows that it fails as it should.
- **Checks:** `npm test` passes (59 tests, 17 of them new DB tests), as do `npm run typecheck`, Biome and `next build`. With no session, `/teams/<id>` redirects to `/login?next=…`. I could not see the signed-in pages: the migration isn't on the cloud project yet, and I have no account.
- **Review:** I ran a two-axis review. I fixed the drawer footer (now sticky), the last breadcrumb (now always body colour) and moved `isTeamId` out of the server-only module.

For the human, in this order:

1. `npm run db:push` applies the teams migration. **Do this before running the dashboard against the cloud again.** The layout now loads teams, so without the migration every dashboard page fails.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql` as is. "Success" means all nine checks passed and nothing was kept. An error names the failed check. After that, tick criterion 5.
3. Log in as the Super Admin. Create a team at `/teams`, rename it, and check that it shows in the sidebar and the breadcrumb.
4. Optional, with a second, non–Super Admin account: add it to the team in the SQL editor (`insert into public.team_members (team_id, user_id, role) values ('<team>', '<user>', 'member');`). Check that it sees only that team, that it has no *Team anlegen* or *Umbenennen*, and that another team's URL shows *Team nicht gefunden*.

Open points for the reviewer:

- A new team has no members, so it has no Team Admin until ticket 05 adds members. Blueprint §2.2 ("never lose its last Team Admin") is about removal, so I read it as not applying at creation. Ticket 05 could let the Super Admin name the first Team Admin.
- The checklist's "member cannot join another team or change a role" checks pass because `team_members` has no write grants. When ticket 05 adds the grants it must add matching policies, and extend the checklist.
- Team names don't have to be unique; the spec doesn't ask for it.
- Beyond the criteria: the member count, the sidebar team list and breadcrumbs, `ContentPanel` `subtitle`/`actions`, and `formatDate` (de-DE, Europe/Berlin).
- The detail page's facts are left-aligned with the title and capped at 800px, rather than centred (ui-design §4.4). Centring only the facts under a left-aligned title looked off.

# 04: Teams

**What to build:** A Super Admin creates and renames teams. People see the teams they belong to at `/teams` and a team's details at `/teams/[id]`. Row-level security keeps everyone except Super Admins inside their own teams.

**Blocked by:** 03 (Invite-only login)

**Status:** ready-for-agent

- [ ] `teams` and `team_members` tables with role `team_admin` | `member`; unique (team, person)
- [ ] Super Admins can create and rename teams; others cannot
- [ ] `/teams` lists only my teams (all teams for a Super Admin)
- [ ] `/teams/[id]` of a team I don't belong to is not accessible
- [ ] RLS enforces team boundaries with the Super Admin bypass; a manual RLS checklist is written and run with a test team

# 06: Audit log

**What to build:** Security-relevant actions are recorded and visible: Team Admins see their team's entries, Super Admins see everything. This ticket adds the recording helper later tickets use and instruments membership and role changes.

**Blocked by:** 05 (Membership management)

**Status:** ready-for-agent

- [ ] `audit_log` table: team, actor, action, entity type/id, details, timestamp; details never contain submission data
- [ ] One shared helper records entries; invites, removals and role changes use it
- [ ] Team Admins see their team's log; Super Admins see all; Team Members see none
- [ ] Entries cannot be edited or deleted through the dashboard

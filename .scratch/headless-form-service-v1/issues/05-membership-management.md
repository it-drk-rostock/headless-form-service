# 05: Membership management

**What to build:** Team Admins (and Super Admins) manage who is in their team: invite people by email, change roles, remove members, and send a new set-password link to someone who forgot their password. A team can never lose its last Team Admin. One person can belong to several teams.

**Blocked by:** 04 (Teams)

**Status:** ready-for-agent

- [ ] Inviting an email creates the account if needed and sends an invite via IONOS SMTP; existing accounts are simply added
- [ ] Team Admins can change roles and remove members of their own team only
- [ ] Removing or demoting the last Team Admin is blocked (a Super Admin can override)
- [ ] Admins can send a set-password link to a member
- [ ] Team Members see the member list but no management actions
- [ ] Operations needing the service-role key run only on the dashboard server

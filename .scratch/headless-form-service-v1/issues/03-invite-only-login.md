# 03: Invite-only login

**What to build:** Staff log in to the dashboard with email and password. Nobody can sign up on their own. The first Super Admin is bootstrapped once. Auth emails (invites, set-password links) go through IONOS SMTP configured as Supabase custom SMTP. There is no self-service password reset and no MFA.

**Blocked by:** 01 (Backend tooling), 02 (Dashboard shell)

**Status:** ready-for-agent

- [ ] A `profiles` row exists for each auth user (email, full name, `is_super_admin`)
- [ ] Public sign-up is disabled in Supabase Auth
- [ ] Signed-out visitors to any dashboard page are redirected to the login page
- [ ] A documented one-time step makes the first person a Super Admin
- [ ] Supabase Auth sends emails through IONOS SMTP (credentials configured as secrets, not in the repo)
- [ ] The login page has no 'forgot password' link

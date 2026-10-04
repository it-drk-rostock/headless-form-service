# 20: Global settings page

**What to build:** A Super Admin manages global settings in the dashboard: allowed origins and rate limits. Changes take effect without redeploying.

**Blocked by:** 06 (Audit log), 11 (`embed.js` shows a public form), 14 (Rate limiting)

**Status:** ready-for-agent

- [ ] Settings page visible only to Super Admins
- [ ] Allowed origins and both rate limits are editable and validated
- [ ] `/load-form` and `/submit-form` pick up changes
- [ ] Changes are recorded in the audit log

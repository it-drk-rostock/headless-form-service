# 29: Form passes from n8n

**What to build:** n8n creates form passes for protected forms through `/generate-form-pass` with one global Bearer key (ADR-0005), never with the service-role key.

**Blocked by:** 25 (Form passes in the dashboard)

**Status:** ready-for-agent

- [ ] The Bearer key is checked against `N8N_INTEGRATION_KEY`
- [ ] Input: form ID (must be a protected form), use limit (default 1, null = unlimited), expiry hours (default 48), metadata
- [ ] Output: pass secret, expiry, and URL when a form page is set
- [ ] Passes are created with source `n8n`; handler tests include a bad key and a public form

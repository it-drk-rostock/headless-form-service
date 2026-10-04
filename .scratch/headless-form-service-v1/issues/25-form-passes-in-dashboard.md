# 25: Form passes in the dashboard

**What to build:** Team members make a form protected, set its form page, and create form passes with an optional use limit, optional expiry and optional pass metadata (flat string/number values, no personal data). The secret link is shown only once; passes are stored hashed. Passes can be listed and revoked.

**Blocked by:** 06 (Audit log), 07 (Create forms & form settings)

**Status:** ready-for-agent

- [ ] Access type and form page settings on the form
- [ ] `form_passes` table with token hash, use limit, use count, expiry, revoked, source, metadata
- [ ] Creation shows `<form page>?form_pass=<secret>` once with a copy button
- [ ] Metadata is validated as flat string/number values
- [ ] The list shows status (valid, used up, expired, revoked) without secrets; revoking works
- [ ] Creation and revocation are recorded in the audit log

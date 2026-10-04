# 21: Allowed recipient domains

**What to build:** Submissions can't be redirected to private mailboxes: a Super Admin maintains a list of allowed recipient domains, and recipients outside it are rejected.

**Blocked by:** 07 (Create forms & form settings), 20 (Global settings page)

**Status:** ready-for-agent

- [ ] Allowed recipient domains editable in global settings
- [ ] Saving a recipient outside the allowed domains fails with a German message
- [ ] The dispatcher refuses to send to non-allowed recipients (defence in depth)

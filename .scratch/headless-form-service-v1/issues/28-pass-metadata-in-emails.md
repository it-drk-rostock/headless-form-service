# 28: Pass metadata in emails

**What to build:** Notification emails can include context from the form pass, e.g. a ticket or campaign ID, via `{{pass.*}}` placeholders.

**Blocked by:** 17 (Standard Layout editor), 27 (Protected submission)

**Status:** ready-for-agent

- [ ] The renderer resolves `{{pass.<key>}}` from the claimed pass's metadata
- [ ] The editor offers `pass.*` placeholders for protected forms
- [ ] Missing keys render empty
- [ ] Renderer tests

# 23: Closing forms

**What to build:** A team member temporarily closes a form; the embed shows a German closed notice and submissions are refused until it is reopened.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-agent

- [ ] Close/reopen toggle on the form
- [ ] `/load-form` returns a closed state; the embed shows the notice
- [ ] `/submit-form` rejects submissions to closed forms
- [ ] Changes are recorded in the audit log

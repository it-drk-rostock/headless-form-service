# 24: Archiving & hard delete

**What to build:** Forms no longer needed are archived: hidden from lists and refusing loads and submissions, but keeping versions and statistics. Only a Super Admin can hard-delete a form.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-agent

- [ ] Archive/unarchive action; archived forms visible under a separate filter
- [ ] Archived forms -> 404 from `/load-form` and rejected by `/submit-form`
- [ ] Hard delete only for Super Admins, with confirmation
- [ ] Both actions are recorded in the audit log

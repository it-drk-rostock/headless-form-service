# 19: Reply-To question & sender display name

**What to build:** Staff can reply directly to the person who filled in the form: a form setting picks the question whose answer becomes Reply-To. Each form also has a sender display name shown with the global sender address.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-agent

- [ ] Reply-To question selectable from email-type questions of the current version
- [ ] Reply-To is set only when the answer is a valid email address
- [ ] The sender display name is used in Mailjet's From
- [ ] Changes are recorded in the audit log

# 30: Delivery failure marking & alert

**What to build:** When a notification email can't be sent after all retries, the submission is marked failed and the team's Team Admins get an alert email, so nothing is lost silently.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-agent

- [ ] The QStash failure callback (signature-verified) marks `form_stats` as `failed` with a non-personal failure reason
- [ ] Team Admins of the form's team receive an alert via Mailjet (no submission data)
- [ ] Handler tests for the failure path

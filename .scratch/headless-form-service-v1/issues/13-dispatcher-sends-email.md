# 13: Dispatcher sends the notification email

**What to build:** Queued submissions arrive in the recipients' inboxes. `/dispatch-email` verifies QStash's signature, decrypts, renders the version's email template with the shared renderer (answers table, every value HTML-escaped) and sends via Mailjet from the global sender. This completes the tracer bullet: designer -> TYPO3 embed -> inbox.

**Blocked by:** 12 (Submission is queued encrypted)

**Status:** ready-for-agent

- [ ] Requests without a valid Upstash signature are rejected
- [ ] The shared renderer handles `{{answers_table}}`, `{{form.name}}` and `{{submitted_at}}` (de-DE); all inserted values are escaped
- [ ] Mail goes via Mailjet to the form's recipients from the configured sender
- [ ] `form_stats` status becomes `sent`
- [ ] Renderer unit tests for escaping and the answers table; handler tests with a fake mailer
- [ ] Manual end-to-end check: a submission on a TYPO3 page arrives as an email

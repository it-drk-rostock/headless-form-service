# 13: Dispatcher sends the notification email

**What to build:** Queued submissions arrive in the recipients' inboxes. `/dispatch-email` verifies QStash's signature, decrypts, renders the version's email template with the shared renderer (answers table, every value HTML-escaped) and sends via Mailjet from the global sender. This completes the tracer bullet: designer -> TYPO3 embed -> inbox.

**Blocked by:** 12 (Submission is queued encrypted)

**Status:** ready-for-human

- [x] Requests without a valid Upstash signature are rejected
- [x] The shared renderer handles `{{answers_table}}`, `{{form.name}}` and `{{submitted_at}}` (de-DE); all inserted values are escaped
- [x] Mail goes via Mailjet to the form's recipients from the configured sender
- [x] `form_stats` status becomes `sent`
- [x] Renderer unit tests for escaping and the answers table; handler tests with a fake mailer
- [ ] Manual end-to-end check: a submission on a TYPO3 page arrives as an email

## Comments

**2026-10-06, agent:** Repo side done. Five of six criteria are met and tested. The sixth, the manual end-to-end check, needs the deploy below and a person with a mailbox.

- **Edge function `dispatch-email`:** `POST`, `verify_jwt = false`. QStash sends no Supabase JWT, so the function checks QStash's signature itself.
  - Order: 405 → 401 `signature_invalid` → 400 `request_invalid` → load form and version → 404 `form_not_found` → already `sent`: 200 without a second email → decrypt (422 `submission_unreadable`) → 422 `no_recipients` / `template_invalid` → render → Mailjet (502 `mail_failed`) → mark `sent` → 200.
  - Anything other than 2xx makes QStash retry, then dead-letter. Marking a submission `failed` is ticket 30.
  - The signature is checked with `Receiver.verify({ signature, body, url })` from `@upstash/qstash` 2.12.0. The URL comes from `dispatchEmailUrl()` in `_shared/service.ts`, which `/submit-form` now also publishes to, so the two can't drift.
  - If the email went out but `sent` can't be recorded, the error is logged and the answer is still 200. A retry would email the recipients twice.
- **Renderer:** `lib/shared/notification.ts`.
  - Fills `{{form.name}}`, `{{submitted_at}}` (`06.10.2026, 14:30`, Europe/Berlin) and `{{answers_table}}`, in one pass, so an inserted value can't bring in another placeholder.
  - Every inserted value is HTML-escaped, titles too. The subject is plain text: not escaped, whitespace and CR/LF collapsed, no answers table.
  - The answers table lists non-empty answers in question order. It shows choice texts instead of values, "Sonstiges: …" for other-texts, Ja/Nein, German numbers, and nested answers as `key: value`.
  - Placeholders it doesn't know (e.g. `{{answers.x}}`) stay as written, for tickets 17 and 28.
  - The body is wrapped in a minimal HTML page that ticket 17 replaces with the branded Standard Layout.
  - The schema walk is now shared with `pickAnswers` (`questionsOf` in `lib/shared/answers.ts`).
- **Mailjet:** `supabase/functions/_shared/mailjet.ts`, Send API v3.1 via `fetch`. One message to all recipients, `CustomID` = submission ID. Its errors carry only the HTTP status and Mailjet error codes, never addresses or content.
- **Sender:** the new secret `NOTIFICATION_SENDER_EMAIL`, with the fixed name "DRK Rostock Formular-Service". The per-form name is ticket 19. Added to blueprint §9.
- **Database:** migration `20261006180000_dispatch_email.sql`.
  - `dispatch_submission(submission, form, version)` (security definer, since `form_stats` has no grants) returns the form's name and current recipients, the version's schema and template, `submitted_at` and `status`. Archived forms are still served.
  - `mark_submission_sent(submission)` also turns `failed` into `sent` and clears the reason.
  - Both are `service_role` only. RLS checklist check 32 now also covers them (still 32 checks).
- **Checks:** `npm test` passes, 387 tests. New: renderer (21), handler (20), Mailjet client (4), SQL (8). `npm run typecheck` passes. Biome is clean on all changed files; it still reports errors in the vendored `.agents/` skill files, which this change doesn't touch.
  - One full run earlier had a single failure I couldn't reproduce in three reruns, probably a PGlite timing flake.
  - Not run: `deno check` (Deno isn't installed), and no deploy or real delivery.
- **Review (two axes), fixed:**
  - The schema walk was duplicated between the renderer and `pickAnswers`, and two questions sharing a `valueName` gave two rows. Both now use one shared walk.
  - Message parsing moved next to `QueuedSubmission` (`parseQueuedSubmission`).
  - `SubmissionPayload.answers` is now typed `Answers`.
  - "Already sent" is checked before decrypting, so a redelivery after a key removal doesn't fail.

For the human, in this order:

1. `npm run db:push`, then run `supabase/snippets/rls-checklist-teams.sql` in the SQL editor. Expect 32 of 32.
2. In Mailjet, validate the sender address. Its domain needs SPF and DKIM (`.scratch/sender-domain/spec.md` is still open). Then set the secrets (README, "Delivering submissions"):

   ```bash
   npx supabase secrets set QSTASH_CURRENT_SIGNING_KEY=<from the Upstash console> QSTASH_NEXT_SIGNING_KEY=<from the Upstash console>
   ```

   ```bash
   npx supabase secrets set MAILJET_API_KEY=<key> MAILJET_SECRET_KEY=<secret> NOTIFICATION_SENDER_EMAIL=<validated sender address>
   ```

   `SUBMISSION_ENCRYPTION_KEYS` is already set from ticket 12.
3. `npm run functions:deploy -- dispatch-email submit-form`. `submit-form` changed too: its dispatch URL now comes from `_shared/service.ts`.
4. A direct request without a signature should get 401:

   ```bash
   curl -i -X POST https://qhjysorczroizpgmagpp.supabase.co/functions/v1/dispatch-email -d '{}'
   ```

5. **Manual end-to-end check (the last criterion):** give a published form a recipient you can read. Fill it in on the TYPO3 test page, with a `<b>` tag in one answer.
   - The email should arrive with subject "Neue Einsendung: <form name>" and the German timestamp.
   - It should show the answers table, with the tag shown as text.
   - `select status from form_stats order by submitted_at desc limit 1;` should give `sent`.
   - Messages dead-lettered during ticket 12's testing can be replayed from the Upstash DLQ now.

Open points for the reviewer:

- **No stats row** (the race noted in ticket 12): the email is still sent, and `{{submitted_at}}` then shows the delivery time.
- **Concurrent deliveries:** two QStash deliveries of one message at the same moment could both send. This is at-least-once delivery; no lock was added.
- **422 still retries.** QStash retries anything other than 2xx, so a form without recipients or with an unreadable template goes through all retries before landing in the DLQ. QStash's non-retryable 489 could shortcut this; left for ticket 30.
- **Sender name** is fixed until ticket 19. **Reply-To** is ticket 19, **pass metadata** ticket 28.

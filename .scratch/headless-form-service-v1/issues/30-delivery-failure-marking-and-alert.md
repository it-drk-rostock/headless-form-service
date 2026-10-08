# 30: Delivery failure marking & alert

**What to build:** When a notification email can't be sent after all retries, the submission is marked failed and the team's Team Admins get an alert email, so nothing is lost silently.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-human

- [x] The QStash failure callback (signature-verified) marks `form_stats` as `failed` with a non-personal failure reason
- [x] Team Admins of the form's team receive an alert via Mailjet (no submission data)
- [x] Handler tests for the failure path

## Comments

**2026-10-08, agent:** Implementation is done and ready for human review. The parent spec is `docs/technical_blueprint.md` §4.5 (with §3, §4.3 and §9). There is no feature-local `spec.md`.

- **Failure callback:** `/submit-form` now publishes with `failureCallback` set to the `/dispatch-email` URL (`submit-form/index.ts`).
  - QStash signs the callback like any delivery, and its `sub` is that same URL, so the existing `Receiver.verify` check covers it.
  - `/dispatch-email` recognizes the failure mode by its body: a `sourceBody` that decodes to a queued submission. In this mode it never decrypts anything.
  - Parsing and the alert live in `supabase/functions/dispatch-email/failure.ts`. `handler.ts` routes to `reportFailure`.
- **Failure reason** (non-personal): our own error code and the last HTTP status, e.g. `mail_failed (HTTP 502)`.
  - The code is kept only if it matches `^[a-z][a-z_]{0,63}$`; any other answer keeps just `HTTP <status>`.
  - Without a status the reason is `no_response`.
- **Database:** migration `20261008140000_delivery_failures.sql` adds `public.record_delivery_failure(submission, form, reason)`. It is security definer and callable only by `service_role`. RLS check 32 now also covers it (still 32 checks).
  - It marks the row `failed` with the reason. A repeated failure keeps the newest reason. A `sent` row stays `sent`.
  - It returns the form and team names, the Team Admins' addresses (sorted), `submitted_at` and the status afterwards.
  - No row for a form that is gone. Archived forms still get alerts.
- **Alert:** one Mailjet message to the form's team's Team Admins, from `NOTIFICATION_SENDER_EMAIL` as *DRK Rostock Formular-Service*.
  - Subject *Zustellung fehlgeschlagen: <form name>*. The Standard Layout holds form, team, version, submission time (*unbekannt* without a stats row), submission ID and reason, plus a 7-day DLQ hint.
  - No answers and no pass metadata. `CustomID` is `failure-<submission ID>`.
- **Answers:** 200 `{status: "failed"}`. Other cases:
  - Already `sent`: 200 `{status: "sent"}`, no alert.
  - Form gone: 200 `{status: "form_not_found"}`, no alert.
  - No Team Admin: a log line only.
  - Alert not accepted by Mailjet: 502 `alert_failed`, so QStash retries the callback.
  - Database error: 500.
- **Shared code:** the label/value table of the answers table is now `detailsTable` in `lib/shared/notification.ts`, used by both emails. `fromBase64` is exported from `_shared/submission-crypto.ts`.
- **Tests:**
  - Handler, 15 new: marking and reason, the alert's recipients, sender, subject and content without answers, no decryption, escaping, reason from our code / foreign body / no response, missing stats row, already sent, form gone, no Team Admins, 502 on alert failure, 500 on database failure, forged signature, invalid source message.
  - SQL, 8 new, plus the access test: marks only that row, the returned names and admins (not another team's), `sent` kept, newest reason, missing row, another form's ID, archived form, form gone.
- **Validation:**
  - `npm test -- --maxWorkers=4` passes: **941 tests in 61 files**.
  - `npm run typecheck`, Biome on all changed TS files, `git diff --check` and `npm run build` also pass.
  - Not run: `deno check` (Deno is not installed). No deploy and no real failure callback.

## Standards

Independent review against `d65a898`: **0 documented-standard violations**. ADR-0001 and ADR-0004 are followed. Six baseline smells were found:
- Fixed: the table row markup and `CELL` were duplicated from the answers table. Both now use `detailsTable`.
- Fixed: the base64 decoding duplicated `fromBase64`. It is now reused.
- Fixed: the status union was repeated. It is now `SubmissionStatus`.
- Fixed: `senderName("")` was a magic value. It is now `DEFAULT_SENDER_NAME`.
- Left: copying fields from `RecordedFailure` into `FailureAlertContext`. They are two small types for two seams.
- Left: `dispatch()` serves two modes. The failure mode is one early branch, and its logic sits in `failure.ts`.

"Failure alert" is not yet a GLOSSARY term.

## Spec

Independent review: all three criteria are implemented, with **0 blocking findings**. Privacy was judged sound: only an integer status and our own code reach `failure_reason`, nothing is decrypted, and the alert has metadata only. Ticket 31 stays workable: `qstash_message_id` is stored, a failed replay re-marks the row, and `mark_submission_sent` clears `failed`.

Recorded in the README as known limits, not fixed:
1. A team without a Team Admin gets only a log line. The database already refuses to remove the last Team Admin.
2. If Mailjet accepts the alert but the answer is lost, Team Admins may get a duplicate (at-least-once delivery).
3. If Mailjet stays down through all of the callback's own retries, the row is `failed` but no alert goes out. The callback then lands in the DLQ as its own message.
4. 422 answers still use up every retry before the callback, since QStash's non-retryable 489 was not adopted (ticket 13's open point).

Also not addressed: no test proves that `/submit-form` sets `failureCallback`, because it is wiring in `index.ts` only. A callback with an unreadable source gets 400 and is retried pointlessly.

Review totals: Standards 0 violations, 6 smells (4 fixed); Spec 0 blocking, 4 limits documented, 2 minor left.

## Human review handoff

1. **Deploy.**
   - Run `npm run db:push` to apply `20261008140000_delivery_failures.sql`.
   - Then run `supabase/snippets/rls-checklist-teams.sql` in the SQL editor. Expect 32 of 32.
   - Run `npm run functions:deploy -- dispatch-email submit-form`. Both changed: `submit-form` now sets the failure callback.
   - No new secrets. This agent has not deployed to the shared cloud environment.
2. **Provoke a failure.** Pick a published test form whose team has a Team Admin with a readable mailbox.
   - Make delivery fail, e.g. temporarily set `MAILJET_SECRET_KEY` to a wrong value, then redeploy `dispatch-email`.
   - Submit the form once.
   - Note that the alert goes through Mailjet too, so restore the correct key after QStash's last retry (a few minutes with backoff) and before the callback's retries run out. Alternatively, break delivery another way, e.g. a recipient outside the allowed domains (422 `recipients_not_allowed`).
3. **Check the result.**
   - `select status, failure_reason from form_stats order by submitted_at desc limit 1;` should give `failed` with e.g. `mail_failed (HTTP 502)` or `recipients_not_allowed (HTTP 422)`. No names or addresses.
   - The Team Admins get *Zustellung fehlgeschlagen: <form name>* with form, team, version, time, submission ID and reason, and no answers.
   - The source message is in the Upstash DLQ.
4. **Signature.** A direct POST of a callback-shaped body without a signature should get 401.
5. **Stop.** Stop after the ticket 30 review. No subsequent ticket was started.

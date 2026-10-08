# 31: Failure list & retry

**What to build:** Team members see a form's delivery failures (metadata only) and can retry each one while QStash still retains it.

**Blocked by:** 30 (Delivery failure marking & alert)

**Status:** ready-for-human

- [x] Failure list per form: submission time, version, reason
- [x] 'Retry delivery' replays the DLQ message; status goes back to queued, then sent
- [x] Retry is unavailable once the DLQ message is gone, with an explanation
- [x] Retries are recorded in the audit log

## Comments

**2026-10-08, agent:** Implementation is done and ready for human review. The parent spec is `docs/technical_blueprint.md` §4.5 (with §2.1, §3, §4.3 and §9). There is no feature-local `spec.md`.

- **Database:** migration `20261008160000_failure_retry.sql`.
  - It adds `form_stats.failed_at`, `retried_at` and `dlq_gone_at`. Rows already `failed` take `updated_at` as `failed_at`. `record_delivery_failure` now also sets `failed_at`.
  - Signed-in people may read every `form_stats` column except `qstash_message_id`, through RLS (the form's team members and Super Admins). Nobody signed in can write. Ticket 32 can read the same rows.
  - `delivery_retry_message(submission)` returns the failed message's ID. It refuses with HF011 if the submission is not `failed` or was already found gone.
  - `record_delivery_retry(submission, message)` sets the row back to `queued` under the new message ID and writes `delivery.retried`. The entry is written even if the copy was already delivered.
  - `record_delivery_retry_gone(submission, message)` sets `dlq_gone_at` and writes `delivery.retry_unavailable`. It only does this while the row is still `failed` under that message, so a concurrent retry wins.
  - All three functions are for the form's team members and Super Admins only (`private.delivery_retry_team`), and closed to anon and to the secret key.
- **QStash:** `lib/forms/dead-letter-queue.ts` makes one REST call, `POST /v2/dlq/retry?messageId=<id>&count=1`, the same call as the SDK's `dlq.retry({ filter })`.
  - An empty `responses` means the message is gone. A `deduplicated` copy is treated as an error.
  - The dashboard never receives the message body (ADR-0002).
  - It uses `QSTASH_TOKEN`, plus `QSTASH_URL` if set; the default is the EU region. There is no new npm dependency.
- **Orchestration:** `retryDelivery` in `lib/forms/delivery-failures.ts` returns one of `retried`, `retried_unrecorded`, `gone` or `not_retryable`. The server action is `retryFormDelivery` in `lib/forms/actions.ts`.
- **UI:** the new *Fehler* view (`?view=failures`) in `DeliveryFailures.tsx` lists failures newest first.
  - Columns: submission time and ID, version, reason, and a status badge. *Fehlgeschlagen* is red with an icon and *Wird erneut zugestellt* is orange (ui-design §2.3).
  - *Zustellung wiederholen* shows for 7 days after `failed_at`.
  - Otherwise an explanation shows: the 7-day retention is over, or the message is no longer held by QStash.
  - Errors show under the button.
- **Audit log:** *Zustellung wiederholt* and *Zustellung nicht mehr wiederholbar*, each with form name, version and submission time.
- **Docs:** README *Retrying failed deliveries* and `.env.example` (`QSTASH_TOKEN` for the dashboard).
- **RLS checklist:** now 46 checks. New check 45 (members see and retry their own team's failures, never QStash IDs; other teams can do neither) and check 46 (the retry is in the log). Check 32 also covers `delivery_retry_message` for anon.
- **Tests:**
  - SQL, 15 new: the list's visibility and columns, `failed_at`, retry permissions, HF011, queued under the new message then sent or failed again, the audit entry, a retry recorded after delivery, gone (marked, audited, left alone after someone else's retry, cleared by a retry).
  - DLQ client, 5 new. Orchestration and failure list, 12 new. Audit labels, 2 new. Checklist guards, 3 new.
- **Validation:**
  - `npm test -- --maxWorkers=4` passes: **978 tests in 64 files**.
  - `npm run typecheck`, Biome on the changed files, `git diff --check` and `npm run build` also pass.
  - `npm run dev` started without server errors, but I could not open the view. That needs signing in to the shared cloud project, and the migration is not deployed yet.
  - Not tested: a real QStash DLQ retry. The bulk retry endpoint's behaviour comes from the SDK 2.12.0 source; its API reference page could not be fetched.

## Standards

Independent review: two breaches of documented standards, both fixed.
- Fixed: the status badges used orange and blue, and the comment misquoted ui-design §2.3. *Fehlgeschlagen* is now red with an icon and text, *Wird erneut zugestellt* orange, from one shared map.
- Fixed: the first version listed the DLQ (`GET /v2/dlq`), which returns encrypted bodies to the dashboard. That goes against ADR-0002's premise that the dashboard never sees submissions. It now retries by message ID in one call.

Judgement calls and smells:
- Fixed: the tab is now *Fehler*, as ui-design §5 names it. Renamed `failedMessage` to `failedMessageId`. Added `DAY_MS`. Rewrapped the page doc comment. The RLS policy no longer says "submissions" (GLOSSARY: submissions are never stored).
- Left: three `rpc` + `throw` closures in the action, the `(submission, message)` pair, `DeliveryFailure.id` (documented as the submission ID), the audit entity type `submission`, and a check that `QSTASH_URL` is an EU region (a comment only, as for the edge functions).

## Spec

Independent review: all four criteria are implemented, with no missing requirement. Privacy was judged sound: only metadata is read, and the retry passes only IDs.
- Fixed: a retry that finds the message gone is now audited too (`delivery.retry_unavailable`).
- Left, and documented in the README as a known limit: `record_delivery_retry` and `record_delivery_retry_gone` trust the dashboard's report of QStash's answer. A team member calling them directly could mark their own team's failure as retried or gone without asking QStash. The audit log names them.
  - A full fix would need the server to call these functions with the secret key and pass in the actor. That breaks `record_audit`'s rule that the actor is always the signed-in person.
- Left: the member-facing functions hand out the QStash message ID. It is useless without the token.
- Left: a race in which the copy fails again before the retry is recorded (about 30 minutes of QStash retries) leaves the row `queued`.
- Left: `failed_at` is when the callback ran, so a late callback may briefly offer a retry the DLQ can't serve. The `gone` path catches it.
- Left: retry also works on archived forms, as the dispatcher still delivers for them.

Review totals: Standards 2 breaches (fixed), 9 smells (5 fixed); Spec 0 missing, 1 partial (fixed), 5 points left (1 documented as a limit).

## Human review handoff

1. **Deploy.**
   - Run `npm run db:push` to apply `20261008160000_failure_retry.sql`. Do this before deploying the dashboard: `/forms/[id]` reads the new columns and fails without them.
   - Then run `supabase/snippets/rls-checklist-teams.sql` in the SQL editor. Expect *46 of 46*.
   - Set the dashboard's token: `QSTASH_TOKEN` in `.env.local`, and in production `npx wrangler secret put QSTASH_TOKEN`. Use the same EU token as the edge functions. Then `npm run deploy`.
   - No edge function changed. This agent has not deployed anything.
2. **Make a failure.** Follow the ticket 30 handoff, step 2: break delivery (e.g. a wrong `MAILJET_SECRET_KEY`), submit a test form and wait for QStash's retries. Then fix delivery again.
3. **Check the list.** On `/forms/<id>?view=failures` (*Fehler*), the submission should show with its time and ID, version, reason and a red *Fehlgeschlagen* badge. A member of another team should not see it.
4. **Retry.**
   - Click *Zustellung wiederholen*. The row should turn into *Wird erneut zugestellt*.
   - Then the recipients should get the notification email, and after a reload the row should be gone.
   - `select status, retried_at from form_stats where id = '<submission>';` should give `sent`.
   - The team's audit log should show *Zustellung wiederholt* by you.
   - Please confirm that QStash's bulk retry by `messageId` works as the SDK suggests, and that the copy still carries the failure callback (retry once more while delivery is still broken; the row should go back to `failed` and a new alert should arrive).
5. **Gone.** Delete a failed message in the Upstash console's DLQ, then click *Zustellung wiederholen* for it. The row should explain that it cannot be delivered any more. The log should show *Zustellung nicht mehr wiederholbar*.
6. **Stop.** Stop after the ticket 31 review. No subsequent ticket was started.

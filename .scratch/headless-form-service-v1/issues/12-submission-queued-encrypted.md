# 12: Submission is queued encrypted

**What to build:** When a visitor completes a public form, the embed sends the answers to `/submit-form`, which encrypts them and queues them in QStash (ADR-0001). On 202 the embed shows SurveyJS's completion text; otherwise a German error. The embed creates a submission ID per form load and reuses it on retries.

**Blocked by:** 11 (`embed.js` shows a public form)

**Status:** ready-for-human

- [x] The request carries form, version, submission ID and answers
- [x] Answers for keys that are not questions of that version are dropped
- [x] A `form_stats` row (`queued`) is written with the submission ID; answers are stored nowhere
- [x] Answers are AES-GCM encrypted with a key only edge functions hold; the QStash message contains only ciphertext and IDs
- [x] QStash publish uses the submission ID as deduplication ID, with 3 retries
- [x] If publishing fails, the stats row is removed and 503 returned
- [x] Handler tests cover success, unknown keys, publish failure and unknown version

## Comments

**2026-10-06, agent:** Repo side done. All seven criteria are met and tested: the handler and encryption with fakes, the SQL against the migrations (PGlite), and the embed's client with a fake `fetch`. A human still has to push the migration, set two secrets and deploy the function (ADR-0006). Mail delivery waits for ticket 13.

- **Database:** migration `supabase/migrations/20261006150000_submit_form.sql`.
  - `public.form_stats`, as in §3. `id` is the submission ID, and `(form_id, version)` references `form_versions`. The table has no answer column. It has no Data API access for anyone, the secret key included.
  - `public.submission_form(form, version)` (security invoker) returns the schema and access type of that version. The form must be published and not archived. Older versions are accepted too, so a visitor whose form was republished while they filled it in can still send it.
  - `queue_submission`, `unqueue_submission` and `record_queued_message` are security definer and executable only by `service_role`.
  - `unqueue` only removes rows that are still `queued`.
- **Encryption:** `supabase/functions/_shared/submission-crypto.ts`, AES-256-GCM through Web Crypto.
  - Each message gets a fresh IV. The submission, form and version go in as associated data, so a ciphertext moved to another message fails to decrypt.
  - Keys come from the secret `SUBMISSION_ENCRYPTION_KEYS` (`id:base64,…`). The first key encrypts and all of them decrypt, which is how rotation works (§4.5).
  - `decryptSubmission` and the `QueuedSubmission` type are there for ticket 13.
- **Edge function `submit-form`:** `POST`, with `verify_jwt = false`.
  - The handler takes injected dependencies. `index.ts` wires supabase-js and `@upstash/qstash` 2.12.0, whose default URL is the EU region.
  - The client from `load-form/index.ts` and the allowed-origins read moved to `_shared/service.ts`, which both functions now use.
  - Order: CORS → 405 → 400 `request_invalid` → 404 `form_not_found` → 403 `form_pass_invalid` (protected, until ticket 27) → drop unknown keys → encrypt → `queued` row → publish to `/functions/v1/dispatch-email` (dedup ID = submission ID, `retries: 3`) → 202 `{"status":"accepted"}`.
  - If publishing fails: the row is removed and the answer is 503 `queue_unavailable`. If the message ID can't be recorded, the error is logged and the answer is still 202.
- **Unknown keys:** `lib/shared/answers.ts` `pickAnswers` keeps:
  - a question's `valueName`, falling back to its `name`;
  - its `-Comment` key ("other" texts, comment areas);
  - questions inside panels, on every page or at the top level;
  - a dynamic panel's value as a whole.

  It drops panel names, `html`/`image` elements and everything else.
- **Embed:**
  - Each form load gets its own submission ID (`newSubmissionId`, a UUID v4 from `getRandomValues`, so it also works without HTTPS).
  - *Abschließen* keeps the form open while sending ("Ihre Angaben werden gesendet …"). On 202 it completes, and SurveyJS shows its completion text. Otherwise a German error shows in the form, and the next click sends again with the same ID.
  - Answers to questions that were hidden again are cleared (`clearInvisibleValues = "onHidden"`), so they are not sent.
  - The `submitUnavailable` guard from ticket 11 is gone.
- **Checks:**
  - `npm test` passes, 334 tests. The new ones cover the handler (15), encryption (9), `pickAnswers` (6), SQL (13), the embed client (10), and `noStoreJsonResponse`.
  - `npm run typecheck` and Biome pass.
  - Not run: `deno check` on the Deno files (Deno isn't installed), and no deploy or real request.
- **Browser check (local, stubbed `fetch`):** `embed.js` from the dev server rendered a test form. The first *Abschließen* got a 503 and showed the German error, and the form stayed open. The second got a 202 and showed the completion text. Both requests had the same submission ID. A hidden-again answer was not in either.
- **Review (two axes), fixed:**
  - If publishing failed and the row couldn't be removed either, a retry got 202 although nothing was published. A row now counts as queued only once QStash's message ID is recorded. Before that, a retry publishes again, and QStash's deduplication keeps it to one message.
  - `isObject` existed three times; it's now `lib/shared/object.ts`.
  - The no-store `reply` was duplicated; it's now `noStoreJsonResponse` in `lib/shared/http.ts`.
  - The encryption payload is now typed.
  - The README says `QSTASH_URL` must stay in the EU.

For the human, in this order:

1. `npm run db:push`, then run `supabase/snippets/rls-checklist-teams.sql` in the SQL editor. Expect 32 of 32. Check 32 covers the new table and functions.
2. Set the secrets (README, "Submitting forms"):

   ```bash
   npx supabase secrets set QSTASH_TOKEN=<EU token from the Upstash console>
   ```

   ```bash
   npx supabase secrets set SUBMISSION_ENCRYPTION_KEYS=k1:<output of: openssl rand -base64 32>
   ```

   Also keep the key in a password manager. Without it, dead-lettered messages can't be read.
3. `npm run functions:deploy -- submit-form load-form`. `load-form` changed too: its client moved to `_shared/service.ts`.
4. With a published form's ID and current version:

   ```bash
   curl -i -X POST -H "Origin: http://localhost:3000" -H "content-type: application/json" -d '{"form_id":"<id>","version":<n>,"submission_id":"<a fresh uuid>","answers":{"<question>":"Test","isAdmin":true}}' https://qhjysorczroizpgmagpp.supabase.co/functions/v1/submit-form
   ```

   Expect 202 `{"status":"accepted"}`. `select * from form_stats;` should show the row as `queued`, with a `qstash_message_id`. In the Upstash console, the message body should hold only IDs and `encrypted` (`v`, `kid`, `iv`, `ct`), with no answer text. Its destination is `/functions/v1/dispatch-email`, which doesn't exist until ticket 13, so it will fail, retry and land in the DLQ. That is expected for now.
5. The same request again: 202, and no second message in Upstash. With `"version":999`: 404.
6. Optional: after `npm run deploy`, fill in a form on the TYPO3 test page from ticket 11. It should show the completion text.

Open points for the reviewer:

- **"3 retries" vs "3 attempts":** the ticket says 3 retries and §4.3 says "3 attempts". QStash's `retries: 3` means up to 4 deliveries. I followed the ticket; it's one constant (`RETRIES` in `handler.ts`).
- **Ticket 16's dedup is partly here.** A retry of a submission QStash already has gets 202 without a new publish, and that is tested. It falls out of the stats insert. Ticket 16 still owns the size limit and the 422 validation.
- **A small race remains.** If a first attempt is still publishing when its retry arrives, and that first publish then fails, its cleanup removes the row the retry relies on. The message is still sent once (dedup), but its `form_stats` row is gone. Ticket 13 should treat a missing row on `sent` as harmless.
- **An ID reused for another form or version** gets 202 without publishing. Only a hand-made request can do that, since the embed makes a new ID per load.
- **Protected forms get 403 `form_pass_invalid`** until ticket 27. Closed forms are accepted until ticket 23.
- **No failure callback yet** (ticket 30). The publishing client retries twice quickly (`retry: { retries: 2 }`), so a visitor waits about half a second, not the SDK default of about 12 s.
- **The completion text is SurveyJS's German default** ("Vielen Dank, dass Sie die Umfrage abgeschlossen haben!"). Designers can set their own in the Creator.

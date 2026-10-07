# 19: Reply-To question & sender display name

**What to build:** Staff can reply directly to the person who filled in the form: a form setting picks the question whose answer becomes Reply-To. Each form also has a sender display name shown with the global sender address.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-human

- [x] Reply-To question selectable from email-type questions of the current version
- [x] Reply-To is set only when the answer is a valid email address
- [x] The sender display name is used in Mailjet's From
- [x] Changes are recorded in the audit log

## Comments

**2026-10-07, agent:** The repo work is done. All four criteria are met and tested. Before it works live, a human has to push the migration and redeploy `dispatch-email` (ADR-0006).

- **Database:** migration `20261007140000_reply_to_and_sender_name.sql`.
  - Members of the owning team and Super Admins may now write `reply_to_question` and `sender_display_name` (column grants, same RLS as before).
  - New checks:
    - `reply_to_question` is null or not empty;
    - `sender_display_name` has no control characters, since it goes into the From header. The 100-character limit is from ticket 07.
  - Audit: `form.reply_to_changed` and `form.sender_name_changed`, each with `name`, `from` and `to`. They commit with the change, and a save that changes nothing records nothing. The audit log shows them in German as *Antwortadresse geändert* and *Absendername geändert*. An empty sender name shows as *DRK Rostock Formular-Service*, no question as *keine*.
  - `dispatch_submission` also returns `sender_display_name` and `reply_to_question`. Both come from the form as it is now, like recipients (ADR-0003).
- **Shared code** (`lib/shared/notification.ts`):
  - `emailQuestions(schema)` lists the questions of type `text` with `inputType: "email"`, by answer key (`valueName` if set), in question order. Questions inside panels count. Questions inside dynamic panels don't, because their answers aren't top-level.
  - `replyToAddress(answers, question)` returns the trimmed answer only when it is a string and one valid address (the same rule as recipients, `lib/shared/email.ts`). Otherwise it returns null.
  - `senderName(displayName)` returns the form's name on one line, or `DEFAULT_SENDER_NAME` ("DRK Rostock Formular-Service", the name used so far) when the form has none. `normalizeSenderName` is the same rule for saving.
- **Dispatcher:**
  - From is `NOTIFICATION_SENDER_EMAIL` with `senderName(...)`. The handler's dependency is now `senderEmail` instead of a fixed `sender` object.
  - Mailjet gets `ReplyTo: { Email }` only when there is an address. If there is none, the email is still sent, without Reply-To.
- **Dashboard (*Einstellungen*):**
  - **Absendername:** the placeholder shows the default name. It is stored trimmed and on one line, at most 100 characters.
  - **Antworten an:** a select of the current version's email questions, shown as "Titel (name)". It can be cleared, which means no Reply-To.
    - **Unpublished form:** the select is disabled, and its text says it becomes selectable after publishing.
    - **No email question:** the select is disabled, and its text says how to make one (a text field with input type E-Mail).
  - **The server action checks the choice** against the current version, which it reads from the database.
- **A stored question the current version no longer has** stays selectable, labelled "(nicht in der aktuellen Version)", with an orange note. Otherwise every save of the other settings would fail.
- **README:** "Delivering submissions" now describes the sender name and Reply-To.
- **Checks:**
  - `npm test` passes, 577 tests. New tests cover:
    - the helpers (`emailQuestions`, `replyToAddress` including line breaks, lists and over-long values, `senderName`/`normalizeSenderName`, `parseReplyToQuestion`, `senderNameProblem`);
    - Mailjet `ReplyTo`;
    - the handler: From name, the default name, Reply-To set or left out in three cases;
    - the DB: grants, both checks, both audit entries, no entry on a save that changes nothing, and `dispatch_submission`;
    - the audit wording.
  - **Flaky DB tests:** one full run while the dev server was also running had 11 PGlite `beforeEach` timeouts. This is the known flake. The rerun and the final run passed in full.
  - `npm run typecheck`, Biome and `next build` pass.
  - **Browser:** I used a temporary unauthenticated route, since deleted, with three settings states (published, stale question, unpublished). There I checked:
    - choosing a question, which sets the value and enables *Speichern*;
    - the stale-question label and note;
    - the disabled select before publishing;
    - no console errors.

    I did not check the real page, which needs an account and the migration. Not run: `deno check`.
- **Review (two axes).** Fixed:
  - The stale-question note claimed emails go out without Reply-To. Queued submissions of the older version still have the answer, so it now talks about new submissions.
  - The sender name was normalised in two places. There is now one normaliser in `lib/shared`, and it also removes control characters, so the DB check can't surface as a generic error.
  - The `emailQuestions` comment now uses the glossary term.

  Left as is (judgement calls):
  - The two new audit summaries share their shape.
  - `senderDisplayName`/`replyToQuestion` travel together but are not bundled in a type, as with Turnstile before.
  - The Reply-To lookup sits in `actions.ts` rather than `queries.ts`.

For the human, in this order:

1. Run `npm run db:push`. **Without it, saving the settings fails** (no grant), and the new dispatcher fails on `dispatch_submission`.
2. Run `npm run functions:deploy -- dispatch-email`. Deploy it right after step 1: the old function still works with the new `dispatch_submission`, but the new function needs the migration.
3. Open a published form whose current version has a text question with input type *E-Mail*. Under *Einstellungen*:
   - Set *Absendername* to e.g. `DRK Erste-Hilfe-Kurse`.
   - Choose that question under *Antworten an*, and save.
4. As the team's Team Admin, open the *Audit-Log*. You should see *Absendername geändert* (`DRK Rostock Formular-Service → DRK Erste-Hilfe-Kurse`) and *Antwortadresse geändert* (`keine → <question name>`).
5. Submit the form on the TYPO3 test page, with your own address in the email question. The email should come from *DRK Erste-Hilfe-Kurse* `<sender address>`. *Antworten* in your mail client should address you.
6. Submit again with `quatsch` in that question, if the form's validation lets it through (e.g. the question is optional with no email validator), or leave it empty. The email should still arrive, and *Antworten* should go to the sender address.
7. Open a form that is not yet published. *Antworten an* should be disabled with the publishing hint.

Open points for the reviewer:

- **Stale question.** A newer version can drop the question or reuse its name for a non-email question. The setting stays, and the dispatcher only checks that the answer is a valid address, not that the question is an email question in that version. That follows blueprint §4.4 to the letter. Checking the question type at send time would be stricter.
- **The choice is not enforced by the database.** Walking SurveyJS JSON in SQL wasn't worth it. A write through the Data API could store any non-empty name. That is harmless, because the dispatcher validates the answer.
- **Race.** A publish between reading the current version and saving could leave a question that the new version doesn't have. This has the same harmless effect as above.
- **Default sender name.** An empty name sends as *DRK Rostock Formular-Service*, the name used since ticket 13. The blueprint doesn't name a fallback.
- **Reply-To keeps the answer's case** (trimmed). Validation uses the lower-cased form.

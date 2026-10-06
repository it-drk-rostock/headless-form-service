# 16: Payload validation & dedup

**What to build:** Submissions that are too big or invalid are rejected, and a network retry never produces a second email.

**Blocked by:** 12 (Submission is queued encrypted)

**Status:** ready-for-human

- [x] Payloads over 64 KB are rejected
- [x] Required questions and basic types are checked against the version's questions -> 422, with a German message in the embed
- [x] A repeated submission ID returns 202 without publishing again
- [x] Validator unit tests in the shared module; handler tests for duplicates

## Comments

**2026-10-06, agent:** Repo side done. All four criteria are met and tested. There's no migration and no new secret. A human still has to deploy `submit-form` and the embed (ADR-0006).

- **Size limit:** `/submit-form` counts the body's bytes while reading it. Over 64 KB, it answers 413 `payload_too_large` before the body is parsed. A `content-length` over the limit is refused without reading. Exactly 64 KB is accepted.
- **Validator:** `lib/shared/answer-validation.ts`, `answerProblems(schema, answers)`. It returns `{ key, problem: "required" | "type" }` per answer, never the value.
  - It runs on the answers left after `pickAnswers` drops unknown keys.
  - **Required:** `isRequired` questions must have an answer. `""`, `null`, `[]` and `{}` count as empty; `false` and `0` count as answers.
  - **Exempt from required:** questions that can be hidden or disabled. That covers `visibleIf`, `enableIf`, `visible: false`, `readOnly` and `hideIfChoicesEmpty`, on the question or on a panel or page around it. It also covers every question of a form with a `complete` or `skip` trigger. `questionsOf` now reports this as `mayBeSkipped`.
  - **Types:** each answer must have the shape SurveyJS stores for its question type. Examples: text for `comment`, a list for `checkbox` (whose entries may be objects with `valuePropertyName`), row → value for `matrix`, a list of objects for `paneldynamic`. `boolean` takes `true`/`false` or its own `valueTrue`/`valueFalse`. `-Comment` answers must be text. `expression` and unknown (custom) types take anything.
- **`/submit-form`:** order is CORS → rate limit → 405 → **413** → 400 → honeypot → 404 → Turnstile → **422 `answers_invalid`** → protected 403 → queue. A 422 logs the form ID and the problem keys, never the answers.
- **Dedup:** this was already in place from ticket 12, where a submission ID QStash has confirmed gets 202 without a new publish. Two new handler tests cover it further: a retry with other answers keeps the first message, and an ID spelled in capitals counts as the same submission.
- **Embed:**
  - 422 → "Einige Angaben fehlen oder sind ungültig. Bitte prüfen Sie das Formular und versuchen Sie es erneut."
  - 413 → "Ihre Angaben sind zu umfangreich, um sie zu senden. Bitte kürzen Sie längere Antworten und versuchen Sie es erneut."
  - The form stays open in both cases.
- **Docs:** README (*Submitting forms*) and blueprint §4.2 step 4 (413, and which required questions are left to SurveyJS).
- **Checks:**
  - `npm test` passes, 507 tests. New: the validator (45), the handler (9: 413, exactly 64 KB, three 422s, unknown keys dropped before checking, Turnstile before the answers, two duplicates), and the embed client (2).
  - `npm run typecheck` and Biome on the changed files pass.
  - Not run: `deno check` (Deno isn't installed). No deploy, and no request against the real function.
- **Browser check (local, stubbed `fetch`):** `embed.js` from the dev server loaded a stubbed form. *Abschließen* got a stubbed 422 and showed the German message inside the open form. The screenshot timed out, so the page text was the check.
- **Review (two axes), fixed:**
  - The checks would have refused answers the real embed sends:
    - a `boolean` with only `valueTrue` set, answered "no";
    - checkbox answers stored as objects (`valuePropertyName`);
    - expressions that compute a list;
    - required questions passed by `complete`/`skip` triggers or hidden by `hideIfChoicesEmpty`.

    All of these now pass, each with a test.
  - `conditional` was renamed to `mayBeSkipped`, since it also covers `readOnly` and `visible: false`.
  - Not changed:
    - The schema is walked twice per request (once to pick, once to check).
    - The embed's growing status-to-reason `if` chain is unchanged.
    - The embed reason for 413 is `too_large`, not the server's `payload_too_large`.

For the human, in this order:

1. `npm run functions:deploy -- submit-form`, then `npm run deploy` for the new `embed.js`.
2. With a published form that has a required question (Turnstile off, or with a valid token), use the `/submit-form` curl from ticket 12:
   - Leave out the required answer, with a fresh `submission_id`. Expect 422 `{"error":"answers_invalid"}`, and no new row in `form_stats`.
   - Send a list as the answer to a text question. Expect 422 too.
   - Send a body over 64 KB, for example an answer of 70,000 characters. Expect 413 `{"error":"payload_too_large"}`.
   - Send a valid request twice with the same `submission_id`. Expect 202 both times, and one message in the Upstash console.
3. On the TYPO3 test page, fill in a real form, including any conditional questions, and send it. It should be accepted. A 422 here means the server check is stricter than SurveyJS; the function log names the question key.

Open points for the reviewer:

- **The server's required check is deliberately loose.** Anything only SurveyJS can evaluate (conditions, triggers, choice filters) is left to the embed, so a forged request can skip those required questions. Running survey-core in the edge function would be exact, but it is a large dependency in Deno. I extended blueprint §4.2 with this exemption, which is a spec change to approve.
- **Choice values are not checked against the choices.** Only the shape is checked (`choicesByUrl`, "other" and similar options make the list open-ended).
- **A retry with changed, invalid answers gets 422, not 202.** Validation runs before the dedup step. The embed sends the same answers on retry, so only hand-made requests can see this.
- **413 behind the platform:** if Supabase's gateway refuses a huge body itself, the answer may lack CORS headers. The embed then shows its general error instead of the "too long" message.

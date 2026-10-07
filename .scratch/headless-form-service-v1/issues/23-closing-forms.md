# 23: Closing forms

**What to build:** A team member temporarily closes a form; the embed shows a German closed notice and submissions are refused until it is reopened.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-human

- [x] Close/reopen toggle on the form
- [x] `/load-form` returns a closed state; the embed shows the notice
- [x] `/submit-form` rejects submissions to closed forms
- [x] Changes are recorded in the audit log

## Comments

**2026-10-07, agent:** The repo work is done. All four criteria are met and tested against the migrations (PGlite) and the handlers. The migration still needs pushing, and the edge functions need deploying, by a human (ADR-0006).

- **Database:** migration `20261007220000_closing_forms.sql`.
  - `grant update (is_closed)` to signed-in people. The existing forms update policy limits it to the owning team's members and Super Admins.
  - `private.audit_form_change()` records `form.closed` or `form.reopened` (details: `name`). The settings trigger now also fires on `is_closed`. Saving without a change records nothing.
  - `public.load_form` and `public.submission_form` now also return `is_closed`. Both were dropped and recreated, still callable only by the secret key.
- **`/load-form`:** a closed form gets `200 { "state": "closed" }`, with no questions and no counted load. This comes after the archived / not-found check and before the pass check (blueprint §4.1).
- **`/submit-form`:** a closed form gets `409 { "error": "form_closed" }` right after the honeypot and the version lookup, so before Turnstile, validation and queueing. This also covers visitors who loaded the form before it was closed.
- **Embed:**
  - Loading a closed form shows *Dieses Formular ist derzeit geschlossen. Einsendungen sind im Moment nicht möglich.* as a status notice, not a red alert.
  - A 409 `form_closed` on submit shows *Dieses Formular ist derzeit geschlossen. Ihre Angaben wurden nicht gesendet.* inside the form.
- **Dashboard:**
  - New switch *Formular geschlossen* in the form's *Einstellungen*, below *Bot-Schutz*, with a hint. It is saved with *Speichern*. The status fact shows the existing orange *Geschlossen* badge, and so does the forms list.
  - **A stale page can't reopen the form.** The action writes `is_closed` only when the switch differs from what the page showed (hidden `wasClosed`). So when someone saves other settings from a page opened before a colleague closed the form, the form stays closed. (`turnstile_enabled` still has that last-write-wins behaviour; I left it alone.)
- **Audit log:** *Formular geschlossen* / *Formular wieder geöffnet*, with the form name as summary.
- **RLS checklist:** now 39 checks.
  - New check 38: a member closes and reopens their own team's form, and cannot close another team's.
  - New check 39: the Team Admin sees both in the log.
  - Check 24 no longer tries `is_closed`, since it now has a write path.
  - One test shows the checklist catches a settings trigger that misses `is_closed`.
- **README:** new section *Closing forms*. *Loading forms* and *Submitting forms* now mention the closed answers.
- **Checks:**
  - `npm test`: 718 tests, all passing (`--maxWorkers=4`), also after the review fixes.
  - New: 3 DB tests on `load_form` / `submission_form`, 3 on grants and audit, 1 checklist test, 3 handler tests, 2 embed tests, 2 audit wording tests.
  - `npm run typecheck`, Biome (on the changed files) and `npm run build` pass.
  - **Browser, partly:** I used a temporary unauthenticated route, since deleted, rendering `FormSettings`. The switch and its hint render, and toggling it enables *Speichern*. There were no console errors. Not checked in a browser: a real save, or the embed against a closed form. Both need an account, the migration and deployed functions.
- **Review (two axes):** nothing missing from the spec. Fixed:
  - a stale settings save could reopen a closed form;
  - the README's load/submit sections did not list the closed answers;
  - the embed now maps a 409 to "closed" only with the `form_closed` code;
  - a test name promised a reopen it didn't do.

  Left as is (judgement calls):
  - Each new form setting touches the two RPCs, both `index.ts` mappers, both handlers and the embed. That is the shape the Turnstile and Reply-To tickets set.
  - `audit_form_change()` is rewritten whole by every settings migration.
  - The two settings switches share their layout props. Extract a component if a third comes.

For the human, in this order:

1. Run `npm run db:push`, which applies the closing migration. Without it, saving settings fails with *Das Formular konnte nicht gespeichert werden*, and the deployed functions below fail to read `is_closed`.
2. Run `npm run functions:deploy`, which ships the new `/load-form` and `/submit-form`, and rebuild/redeploy the dashboard so the embed bundle has the closed notices.
3. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 39 of 39 checks`.
4. As a team member, open a published form whose embed is on an allowed page. Open that page in a second tab and leave it there.
5. In *Einstellungen*, switch on *Formular geschlossen* and click *Speichern*. *Status* should show the orange *Geschlossen*, and so should the forms list.
6. Reload the embed page. Instead of the form, you should see *Dieses Formular ist derzeit geschlossen. Einsendungen sind im Moment nicht möglich.*
7. In the second tab, which still shows the form, fill it in and send it. The form stays open with *Dieses Formular ist derzeit geschlossen. Ihre Angaben wurden nicht gesendet.*, and no email arrives.
8. Switch it off again and save, then reload the embed page. The form shows again, and a submission goes through.
9. As the Team Admin, open the team's *Audit-Log*. You should see *Formular geschlossen* and *Formular wieder geöffnet*, each with the form's name.

Open points for the reviewer:

- **Closing lives in the settings form, saved with *Speichern*.** It is not a separate header button that acts at once. This follows ui-design §5 (settings toggles, *Speichern* disabled until something changed). A header action with a confirm dialog would be more visible, if you prefer.
- **Closed forms can still be edited, published, restored and discarded.** A closed form hands out no questions, so none of that reaches visitors until it is reopened. Ticket 22 suggested a check; I left it out on purpose.
- **Closing does not stop delivery.** Submissions accepted before closing are still emailed (`dispatch_submission` ignores `is_closed`, as the dispatch migration intended).
- **Unpublished closed forms** still get 404 from `/load-form`, not the closed notice, since there is nothing to show.
- **Test seams.** The DB as each role, the edge handlers with fakes, the embed's `load` / `submit` with a fake `fetch`, and the audit wording. These are the seams the repo already uses; I did not agree them beforehand.

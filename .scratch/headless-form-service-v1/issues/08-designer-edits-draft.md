# 08: Designer edits the draft

**What to build:** On a form's page, team members edit the form's questions in SurveyJS Creator. Edits are saved to the single draft; concurrent saves are last-write-wins. File and signature questions are not offered. Creator runs without a licence key for now (the licence notice is expected).

**Blocked by:** 07 (Create forms & form settings)

**Status:** ready-for-human

- [x] SurveyJS Creator loads the draft and saves it back with who/when
- [x] File and signature question types are removed from the toolbox
- [x] Saving the draft does not change what visitors see (only publishing does)
- [x] Creator uses its German locale

## Comments

**2026-10-05, agent:** Repo side done. All four criteria are met and tested against the migrations (PGlite). The migration still needs pushing, and the cloud RLS checklist needs a run, by a human (ADR-0006).

- **Database:** migration `supabase/migrations/20261005210000_forms_draft.sql`.
  - Members (and Super Admins) may now update `draft_schema`, and only that new column. `draft_email_template` gets its write path with ticket 17.
  - The trigger `forms_stamp_draft` sets `draft_updated_by = auth.uid()` and `draft_updated_at = now()` whenever the draft's questions or email template change, whichever path changed them. Nobody can write those two columns directly. A save that changes nothing keeps the old stamp.
  - Last-write-wins: a plain update, no locking or version check.
  - The constraint `forms_draft_schema_question_types_check` refuses any element whose `type` is `file` or `signaturepad` (any case, any depth, including dynamic panels). Matrix columns can't hold files in SurveyJS 3, so they need nothing.
  - Draft saves are not audited. The log records publishing (ticket 09), which is what reaches visitors.
  - Saving the draft leaves `current_version`, closed and archived alone, and there is a test for it. Visitors are served only versions (tickets 09–11).
- **Dashboard:** `/forms/[id]` now has view tabs *Designer · Einstellungen* top right (ui-design §5).
  - The designer is the default. `?view=settings` opens the settings: the facts and the name and recipients from ticket 07, unchanged.
  - Each view mounts when first shown and then stays mounted, so switching tabs never loses designer edits.
  - The designer is SurveyJS Creator 3.1.2 (`survey-creator-react`), loaded client-only. Its UI is in German (`creator.locale = "de"`). It has no licence key, so the licence banner shows, as expected.
  - Every change is saved about 500 ms after it is made (Creator autosave), through the server action `saveDraft`. The action checks the schema with `draftSchemaProblem` before writing.
  - Above the Creator: a note that visitors see changes only after publishing, and *Entwurf gespeichert am … von …*. A form that has never been saved says *Entwurf noch nicht gespeichert*. A failed save shows a German error, and leaving the page with unsaved changes asks first.
  - The toolbox has no file or signature question. I checked in a browser: the item list contains no *Datei* or *Signatur*.
  - The JSON editor, theme and translation tabs are hidden.
- **RLS checklist:** `supabase/snippets/rls-checklist-teams.sql` now has 27 checks.
  - 26: a member saves their team's draft and is stamped as the saver, and can't save another team's draft.
  - 27: a file question is refused.
  - 24 now also covers writing `draft_updated_by` directly.

  Two new tests show the checklist catches a missing stamp trigger and a missing type constraint.
- **Checks:**
  - `npm test` passes: 185 tests. New: 15 DB tests for the draft, 2 checklist tests, 8 helper tests.
  - `npm run typecheck` and `next build` pass. Biome is clean on the changed files; its one remaining finding is an old one under `.agents/`.
  - **Browser, partly:**
    - I could not test the real page: it needs an account, and the migration isn't on the cloud project yet.
    - Instead I rendered the designer on a temporary unauthenticated route, since deleted. There I checked the German Creator UI, the toolbox and the licence banner. There were no console errors.
- **Review:** two-axis review, nothing missing.
  - Fixed:
    - A never-saved draft showed a save time.
    - The Creator mounted while hidden.
    - A plain box instead of `Paper withBorder`.
    - View labels kept apart from `FORM_VIEWS`.
    - The draft data clump, now `FormDraft`.
    - A naming fix.
  - Left as is: the disabled-type list exists twice, in TS and SQL. Comments point each copy to the other, and tests guard both.

For the human, in this order:

1. Run `npm run db:push`, which applies the draft migration. **Without it, every designer save fails** ("Nur Mitglieder …" error), because the column grant is missing.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 27 of 27 checks`.
3. As a team member, open a form on `/forms`.
   - It opens on *Designer*, in German, with the SurveyJS licence banner. The line should say *Entwurf noch nicht gespeichert*.
   - Check the toolbox: there is no file upload or signature question.
4. Add a text question and wait a second. The line should change to *Entwurf gespeichert am … von <your name>*.
5. Reload the page. The question should still be there.
6. Switch to *Einstellungen* and back. The designer should be unchanged, and the URL should switch between `?view=settings` and no parameter.
7. Optional, last-write-wins: open the same form as a second team member, change something there, then reload as the first member. You should see the second member's version and name.
8. Status on `/forms` stays *Entwurf*, so visitors are unaffected until ticket 09.

Open points for the reviewer:

- **Survey default locale.** The designer sets `surveyLocalization.defaultLocale = "de"`, so texts are stored as plain strings and SurveyJS's built-in texts (buttons, errors) show in German in the preview. **The embed (ticket 11) must set the same default locale**, or visitors see English built-in texts.
- **Hidden Creator tabs.**
  - JSON editor: hidden so questions only come from the toolbox (the DB refuses file and signature questions anyway).
  - Theme: the theme isn't saved anywhere.
  - Translation: German only.

  Easy to re-enable in `DraftCreator.tsx`.
- **URL parameter `?view=settings`** is English, while the audit-log pages use `?seite=`. Say if you want `?ansicht=einstellungen`.
- **Autosave vs. a *Speichern* button.** Autosave was chosen so edits aren't lost. With last-write-wins, two people editing at the same time overwrite each other every few seconds. That is accepted by the spec, but worth knowing.
- **Session expiry.** A save after the session expires redirects to the login page. Any edit that wasn't saved yet is then lost.
- **Very large schemas.** A schema over the default 1 MB server-action body limit would fail to save, with the generic error.

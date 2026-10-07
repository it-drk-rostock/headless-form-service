# 24: Archiving & hard delete

**What to build:** Forms no longer needed are archived: hidden from lists and refusing loads and submissions, but keeping versions and statistics. Only a Super Admin can hard-delete a form.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-human

- [x] Archive/unarchive action; archived forms visible under a separate filter
- [x] Archived forms -> 404 from `/load-form` and rejected by `/submit-form`
- [x] Hard delete only for Super Admins, with confirmation
- [x] Both actions are recorded in the audit log

## Comments

**2026-10-07, agent:** The repo work is done. All four criteria are met and tested against the migrations (PGlite). The migration still needs pushing by a human (ADR-0006). No edge function changed: `load_form` and `submission_form` already skipped archived forms.

- **Database:** migration `20261008090000_archiving_and_hard_delete.sql`.
  - `public.archive_form(form)` sets `archived_at = now()`. Archiving an archived form keeps the first time. `public.unarchive_form(form)` clears it. Both are open to members of the owning team and Super Admins. They are functions, not a column grant, so nobody picks the time.
  - `public.delete_form(form)` is for Super Admins only. Anyone else gets `insufficient_privilege`, and an unknown form gets `HF009`. The form goes with its versions, statistics and load counts (foreign keys cascade). Its audit entries stay, since the audit log has no foreign keys. Deleting through the Data API is still refused, even for Super Admins.
  - `private.audit_form_change()` records `form.archived` and `form.unarchived` from the settings trigger, which now also fires on `archived_at`. A new after-delete trigger records `form.deleted`. Details: `name`. The team is kept, so the team's Team Admins still see a deletion.
- **`/load-form` / `/submit-form`:** unchanged. An archived form gets 404 and 404 `form_not_found`. The tests now cover it end to end through `archive_form`, plus unarchiving serving the form again.
- **Dashboard:**
  - `/forms` has *In Verwendung · Archiviert* top right. *Archiviert* is `?filter=archived` and has its own empty state.
  - An archived form's page still opens. A grey info notice under the title says *Archiviert am …*.
  - Below *Einstellungen* is a new section *Archivieren und löschen*:
    - *Archivieren* or *Aus dem Archiv holen*, each confirmed in a modal.
    - *Endgültig löschen* (subtle red, Super Admins only). It asks for the form's name in the modal; the server checks the name again. It then opens `/forms`.
- **Audit log:** *Formular archiviert*, *Formular aus dem Archiv geholt* and *Formular endgültig gelöscht*, each with the form name.
- **RLS checklist:** now 42 checks.
  - New check 40: a member archives and unarchives their own team's form, and cannot archive another team's.
  - New check 41: the Team Admin sees both in the log.
  - New check 42: a Team Admin cannot hard-delete; a Super Admin can, and it is logged.
  - Check 24 now also tries writing `archived_at` directly. Check 9 tries the three functions as anon.
  - Two tests show the checklist catches unlogged archiving and a `delete_form` open to everyone.
- **Docs:** README has a new section *Archiving and deleting forms*. The GLOSSARY's *Archived Form* no longer says "for good", since archiving can now be undone.
- **Checks:**
  - `npm test`: 746 tests, all passing (`--maxWorkers=4`).
  - New: 19 DB tests (`supabase/tests/archiving.test.ts`), 2 checklist tests, and unit tests for the list filter, the delete confirmation and the audit wording.
  - `npm run typecheck`, Biome and `npm run build` pass.
  - **Not checked in a browser.** The in-app browser was refused access to localhost, so nothing was rendered. Everything in the steps below is unverified in a browser.
- **Review (two axes):** nothing missing from the spec. Fixed: the GLOSSARY contradicted reversible archiving. Left as is (judgement calls):
  - The `/forms` filter is a `SegmentedControl`. ui-design §5 lists filters as icon buttons in the list toolbar, but two states read more clearly as labels.
  - `FormLifecycle`'s modal shell duplicates `DraftReset`'s. Extract a shared confirm modal when a third one comes.
  - `audit_form_change()` is rewritten whole again, as each settings migration does.
  - A malformed form ID gets *forbidden* from archive (like the other actions) but *gone* from delete.

For the human, in this order:

1. Run `npm run db:push` to apply the archiving migration. Without it, *Archivieren* and *Endgültig löschen* fail with *Das Formular konnte nicht gespeichert werden*. Then rebuild/redeploy the dashboard.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 42 of 42 checks`.
3. As a team member, open a published form whose embed is on an allowed page. In *Einstellungen → Archivieren und löschen*, click *Archivieren* and confirm. The notice *Archiviert am …* appears under the title, and *Status* shows grey *Archiviert*.
4. Open `/forms`. The form is gone from *In Verwendung* and listed under *Archiviert*.
5. Reload the embed page. The form does not load (404, the embed's not-found message). A tab that still has the form open gets a refused submission, and no email arrives.
6. Click *Aus dem Archiv holen* and confirm. The form is back in the list, and the embed loads it again.
7. As a member or Team Admin, check that *Endgültig löschen* does not show. As a Super Admin, open a test form, click *Endgültig löschen* and type its name. The button turns on only when the name matches. Confirm, and you land on `/forms` with the form gone.
8. As the Team Admin, open the team's *Audit-Log*. You should see *Formular archiviert*, *Formular aus dem Archiv geholt* and *Formular endgültig gelöscht*, each with the form's name.

Open points for the reviewer:

- **Archived forms can still be edited, published, closed and reopened.** None of that reaches visitors while the form is archived. Say if archiving should lock the form instead.
- **Hard delete does not require archiving first**, and it asks for the form's name, which is stricter than "with confirmation". Submissions still queued for a deleted form are not delivered: the dispatcher answers 404, and QStash moves them to the DLQ. The modal says so.
- **Archiving and unarchiving each confirm in a modal.** The ticket did not ask for this. Archiving takes a live form offline at once, so I wanted a confirmation step.
- **Hard-deleting teams** (blueprint §2.1) is not part of this ticket and is not built.
- **Test seams:** the DB as each role, plus pure helpers. These are the repo's existing seams; I did not agree them beforehand.


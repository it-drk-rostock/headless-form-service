# 22: Version history, restore & discard

**What to build:** Team members see a form's version history with changelogs, can restore any version into the draft (to publish it again as a new version), and can discard unpublished draft changes back to the current version.

**Blocked by:** 09 (Publishing)

**Status:** ready-for-human

- [x] Version list with number, author, date, changelog
- [x] Restoring copies a version's questions and email template into the draft
- [x] Discarding changes resets the draft to the current version
- [x] Version numbers stay strictly increasing; restore and discard are recorded in the audit log

## Comments

**2026-10-07, agent:** The repo work is done. All four criteria are met and tested against the migrations (PGlite). The migration still needs pushing, and the cloud RLS checklist needs a run, by a human (ADR-0006).

- **Database:** migration `20261007200000_restore_and_discard.sql`, with two security definer functions. Both follow `publish_form`:
  - they check permission first, then lock the form;
  - only the form's team members and Super Admins may call them. Anyone else gets `42501`. Anon and the service role have no execute grant.
  - **`public.restore_form_version(form, version)`** copies the version's `schema` and `email_template` into `draft_schema` and `draft_email_template`. It records `form.version_restored` (name, version). An unknown version is refused with `HF007`.
  - **`public.discard_draft_changes(form)`** copies the current version into the draft the same way. It records `form.draft_discarded` (name, the version it reset to). A form that is not yet published is refused with `HF008`.
  - Neither writes `form_versions`, so numbers stay strictly increasing. Publishing a restored version 1 after version 2 makes version 3 (tested). `private.stamp_draft()` stamps the caller, as for any draft save.
- **Dashboard (`/forms/[id]`):**
  - **New view *Versionen*** (Designer · E-Mail · Versionen · Einstellungen), `?view=versions`. It shows a table, newest first: version (the current one with a green *Aktuell* dot), *Veröffentlicht am*, *Von* (*Unbekannt* once the account is gone), and *Änderungsnotiz* (*Keine Änderungsnotiz* when empty). A form without versions shows an empty state.
  - **Wiederherstellen** is a default button on each row except the current one, since that one comes back by discarding. It asks in a modal (*Version N wiederherstellen*) and says that visitors keep the current version. On success it says *Version N ist jetzt im Entwurf. Veröffentlicht wird sie als Version M.*
  - **Änderungen verwerfen** is a subtle red button left of *Veröffentlichen*, in the designer and email views, shown only once the form is published. It confirms in a modal with a filled red button (ui-design §2.3).
  - **Both wait for autosave.** While an editor has unsaved changes, the confirm button is disabled with a note. Otherwise a save still on its way could overwrite the replaced draft.
  - **Editors reopen.** On success, the action returns the new draft. `DraftStatusProvider.resetDraft` remounts the designer and the email editor on it (keyed on `reset.resetCount`), and updates the "gespeichert am … von …" stamp. The page refreshes too, so the version numbers are the database's.
  - The audit log shows *Version wiederhergestellt* (`Name: Version N in den Entwurf übernommen`) and *Änderungen verworfen* (`Name: Entwurf auf Version N zurückgesetzt`).
- **Small refactor:** `CurrentVersion` is now `FormVersion` plus the email questions (`lib/forms/publish.ts`). `listFormVersions` is in `lib/forms/queries.ts`.
- **RLS checklist:** now 37 checks.
  - New check 36: a member discards and restores on their own team's form, and cannot on another team's.
  - New check 37: the Team Admin sees both in the log.
  - Check 9 also covers anon restoring and discarding.
  - Two tests show the checklist catches an unguarded restore or discard.
- **README:** new section *Version history, restoring and discarding*.
- **Checks:**
  - `npm test`: 705 tests.
    - New: 14 DB tests, 2 checklist tests, 2 audit wording tests, 1 helper test, and a `formView` assertion.
    - The full run used `--maxWorkers=4` and passed, without the PGlite timeouts this time. It ran before the second checklist test was added; that test and the affected files passed on their own afterwards.
  - `npm run typecheck`, Biome and `next build` pass.
  - **Browser, partly:** I used a temporary unauthenticated route, since deleted, rendering the history, the discard button and both editors in a `DraftStatusProvider`. I checked:
    - the table with the badge, a multi-line changelog, the missing author and changelog, and the empty state;
    - both confirm dialogs;
    - a simulated `resetDraft`: Creator then showed the restored question, the email editor the restored subject and body, and the stamp updated. The remount sent no autosave (no request, no unsaved note), and there were no console errors.

    Not checked in a browser: a real restore or discard. Both need an account and the migration.
- **Review (two axes):** nothing missing. Fixed:
  - the success messages used the page's version numbers without a refresh;
  - `revision` was renamed to `resetCount` (the glossary avoids "revision");
  - restoring the current version duplicated discarding, so its row has no button;
  - a checklist test for discard was added.

  Left as is (judgement calls):
  - The permission preamble now appears three times (publish, restore, discard), and the confirm-modal scaffolding twice (`PublishButton`, `DraftReset`). Extract a helper if a third dialog comes.
  - The draft is re-read in a second request after the RPC. A save landing in between would be shown, which is the true draft anyway.

For the human, in this order:

1. Run `npm run db:push`, which applies the restore and discard migration. Without it, *Wiederherstellen* and *Änderungen verwerfen* show *Das Formular konnte nicht gespeichert werden*. The version list works without it.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 37 of 37 checks`.
3. As a team member, open a form that has never been published:
   - *Versionen* should show *Noch keine Versionen*;
   - the designer should have no *Änderungen verwerfen* button.
4. Publish it twice with different questions and changelogs (versions 1 and 2). *Versionen* should list 2 (*Aktuell*) and 1, each with date, your name and changelog. Only version 1 has *Wiederherstellen*.
5. In the designer, change a question and wait for *Entwurf gespeichert*. Click *Änderungen verwerfen* → *Änderungen verwerfen*. You should see *Der Entwurf entspricht wieder Version 2*. After closing, the designer shows version 2's questions, and the stamp shows you and now.
6. Change a question, then click *Änderungen verwerfen* right away. The note about unsaved changes should show, with the button disabled until autosave finishes.
7. In *Versionen*, restore version 1. You should see *Version 1 ist jetzt im Entwurf. Veröffentlicht wird sie als Version 3.* The designer and *E-Mail* show version 1's questions and template. The badge still says *Version 2*, and the embed still serves version 2.
8. Publish. You get *Version 3*, with version 1's content. *Versionen* lists 3, 2 and 1.
9. As the Team Admin, open the team's *Audit-Log*. You should see *Änderungen verworfen* (`Name: Entwurf auf Version 2 zurückgesetzt`) and *Version wiederhergestellt* (`Name: Version 1 in den Entwurf übernommen`).

Open points for the reviewer:

- **Other open editors aren't told.** Another member's (or another tab's) open designer keeps its old draft. Its next autosave writes only its part (questions or template) over the restored draft, which can mix the two. This is the existing last-write-wins model (ticket 08), but restoring makes it more likely. A warning or realtime reload would be follow-up work.
- **Discarding always shows, and is always logged.** It shows once the form is published, even when the draft equals the current version, and confirming then logs an entry that changed nothing. Comparing draft and current version could hide the button. It would also give the orange "unpublished changes" badge from ui-design §2.3.
- **Archived and closed forms** can be restored and discarded, like publishing. Tickets 23 and 24 can add a check.
- **No preview of an old version.** The list shows metadata only. To look at a version's questions, restore it, then discard to go back.
- **Test seams.** The DB as each role, plus pure helpers (`toFormVersion`, audit wording, `formView`). These are the seams the repo already uses; I did not agree them beforehand.

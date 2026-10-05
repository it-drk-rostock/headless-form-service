# 09: Publishing

**What to build:** A team member publishes the draft: it becomes a new immutable form version (questions plus email template) with an optional changelog, and becomes the current version. New forms start with a default email template (Standard Layout with a greeting and the answers table).

**Blocked by:** 08 (Designer edits the draft)

**Status:** ready-for-human

- [x] `form_versions` table, immutable, unique (form, version), strictly increasing numbers
- [x] Publishing copies the draft's questions and email template into a new version and moves the current version, atomically
- [x] A new form's draft starts with the default email template
- [x] Publishing is recorded in the audit log
- [x] A form without any version shows a clear 'not yet published' state

## Comments

**2026-10-05, agent:** Repo side done. All five criteria are met and tested against the migrations (PGlite). The migration still needs pushing, and the cloud RLS checklist needs a run, by a human (ADR-0006).

- **Database:** migration `supabase/migrations/20261005230000_form_versions.sql`.
  - `public.form_versions` per blueprint §3: `id`, `form_id`, `version`, `schema`, `email_template`, `changelog`, `created_by`, `created_at`. Unique `(form_id, version)`.
    - The changelog is optional and at most 2000 characters. It is trimmed, and a blank one counts as none.
  - **Strictly increasing:** each form's versions are 1, 2, 3, … without gaps. A trigger refuses any other number, from any path, the table owner included (`HF005`).
  - **Immutable:** nobody writes the table through the Data API, not even with the secret key. A trigger refuses edits and deletes from the table owner too (`HF004`). Two exceptions, both caused by other tables' foreign keys:
    - A deleted account clears `created_by`.
    - A form deleted for good (ticket 24) takes its versions with it.
  - `forms (id, current_version)` is a foreign key to `form_versions (form_id, version)`, so the current version always exists.
  - **Publishing** is `public.publish_form(form, changelog)`, a security definer function.
    - Only the form's team members and Super Admins may call it. Anyone else gets `42501`. Anon and the service role have no execute grant.
    - In one transaction it:
      1. checks permission, then locks the form row, so concurrent publishes and draft saves wait;
      2. copies `draft_schema` and `draft_email_template` into version max+1;
      3. sets `forms.current_version`;
      4. records `form.published` (name, version, changelog) in the audit log.
    - It leaves the draft itself alone.
    - It refuses a draft without any question (`HF003`), so a form can't go live empty.
  - **Default email template:** `forms.draft_email_template` now defaults to:
    - `mode`: `"standard"`
    - `subject`: `"Neue Einsendung: {{form.name}}"`
    - `body`: `<p>Hallo,</p><p>über das Formular „{{form.name}}“ ist am {{submitted_at}} eine neue Einsendung eingegangen:</p>{{answers_table}}`

    Existing forms with an empty template get the default too, without changing their draft stamp or `updated_at`.
  - RLS: the version list follows the form. Its team's members and Super Admins see the versions.
- **Dashboard (`/forms/[id]`):**
  - Under the title and ID, in every view, a dot badge shows the current version: grey *Noch nicht veröffentlicht*, or green *Version 3*.
  - Settings has a new fact, *Aktuelle Version*: *Version 3, veröffentlicht am … von …*. A form with no version shows *Noch nicht veröffentlicht* and a hint that visitors see it only after the first publish.
  - The designer view has *Veröffentlichen* next to the view tabs. It isn't in settings, because that view already has its filled *Speichern* (ui-design §1: one primary button per view).
  - The publish dialog:
    - says which version number comes next;
    - takes an optional *Änderungsnotiz*;
    - warns in orange when the form has no recipients, but doesn't block (see open points);
    - after success, shows *Version N ist veröffentlicht*. The page refreshes, so the badge updates.
  - **Unsaved designer edits:** while the designer has changes that aren't saved yet, the dialog says so and *Veröffentlichen* stays disabled until autosave catches up. Without this, an edit made just before clicking would be missing from the version. The designer and the dialog share this state through `DraftStatusProvider`.
  - The audit log shows *Formular veröffentlicht* with `Name: Version N`.
- **RLS checklist:** `supabase/snippets/rls-checklist-teams.sql` now has 31 checks.
  - 28: a member publishes their team's form as version 1, and it becomes current. They can't publish another team's form.
  - 29: form versions can't be inserted or changed directly.
  - 30: other teams' versions are invisible.
  - 31: the Team Admin sees the publish in the log.
  - 9 now also covers anon reading versions and publishing.

  Two new tests show the checklist catches a writable version table and a leaking version policy.
- **Small refactor:** an embedded profile is named by its name, else its address. That rule is now `profileName` in `lib/shared/profile.ts`, used by both the draft stamp and the current version.
- **Checks:**
  - `npm test` passes: 218 tests. New: 24 DB tests for publishing, 2 checklist tests, 6 helper tests, 1 audit wording test.
  - `npm run typecheck`, Biome and `next build` pass.
  - **Browser, partly:**
    - I could not test the real page: it needs an account, and the migration isn't on the cloud project yet.
    - Instead I rendered the header, badges and publish dialog on a temporary unauthenticated route, since deleted. There I checked:
      - At 960px the badge sits under the ID without crowding the title.
      - The dialog shows its text, the recipient warning, the changelog field and the buttons.
      - There were no console errors.
    - Not checked in a browser: the disabled state during autosave, and a real publish.
- **Review:** two-axis review, nothing missing.
  - Fixed:
    - Two filled buttons in settings.
    - "Publication" naming. The glossary says *Current Version*, so it is now `CurrentVersion` / `getCurrentVersion`.
    - The form was locked before the permission check, so anyone signed in could hold another team's form.
    - One error code for two failures. It is now `HF004` and `HF005`.
    - Publishing could freeze a stale draft.
    - The duplicated profile display name.
  - Left as is:
    - The changelog limit exists in both TS and SQL, each pointing to the other in a comment, like the draft question types.
    - The extra query for the current version after `getForm`. Embedding it would need PostgREST's composite-key embed, which the PGlite tests can't cover.

For the human, in this order:

1. Run `npm run db:push`, which applies the publishing migration. **Without it, `/forms/[id]` fails to load**, because the page now queries `form_versions`.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 31 of 31 checks`.
3. As a team member, open a form that has never been published.
   - Under the ID it should say *Noch nicht veröffentlicht*.
   - *Einstellungen* → *Aktuelle Version* should say the same, with the hint.
4. On a form without questions, click *Veröffentlichen* → *Veröffentlichen*. You should see *Der Entwurf hat noch keine Fragen …*.
5. Add a question and click *Veröffentlichen* straight away.
   - While autosave runs, the dialog should show the unsaved-changes note with the button disabled. About half a second later the button is enabled.
   - Enter a changelog and publish. You should see *Version 1 ist veröffentlicht*, and the badge turns green: *Version 1*.
6. Change a question, then publish again. You should get *Version 2*.
   - On `/forms` the status should be *Veröffentlicht*.
   - *Einstellungen* should show *Version 2, veröffentlicht am … von <your name>*.
7. As the team's Team Admin, open the team's *Audit-Log*. You should see *Formular veröffentlicht* twice (`<Name>: Version 1`, `<Name>: Version 2`).
8. Optional: run `select version, changelog, email_template->>'subject' from form_versions order by created_at desc limit 2;` in the SQL editor. Both versions should have the default template's subject.

Open points for the reviewer:

- **No recipients only warns.** Ticket 07 asked whether publishing should refuse a form without recipients. I chose a warning in the dialog, so a team can publish first and set recipients afterwards. The dispatcher (ticket 13) must then handle an empty list. Say if publishing should refuse instead.
- **Archived and closed forms can be published.** Publishing doesn't change whether they are served. Tickets 23 and 24 own those states and can add a check if wanted.
- **The default template is a contract for ticket 17.** The Tiptap editor and the renderer must accept its shape, or migrate it:
  - `mode: "standard"`; Custom HTML would be a second value.
  - The subject.
  - An HTML body with `{{answers_table}}` as a bare block, not inside a `<p>`.
- **Beyond the criteria:**
  - A draft without questions is refused.
  - The 2000-character changelog limit.
  - Settings shows who published and when. That edges into ticket 22's version list, but it shows only the current version.
- **The owner can still clear `created_by` by hand.** The immutability trigger allows setting `created_by` to null, because a deleted account does exactly that through the foreign key. Only the table owner (SQL editor) can do it by hand.
- **Test seams.** The DB as each role, plus pure helpers (`normalizeChangelog`, `changelogProblem`, `toCurrentVersion`, audit wording). These are the seams the repo already uses; I did not agree them beforehand.

# 07: Create forms & form settings

**What to build:** Team members create forms for their teams and manage basic settings. `/forms` lists forms across all my teams; `/forms/[id]` shows a form's settings with its name and recipients.

**Blocked by:** 04 (Teams), 06 (Audit log)

**Status:** ready-for-human

- [x] `forms` table per the blueprint (draft fields, nullable current version, closed/archived fields, recipients, ...) with team RLS
- [x] Creating a form asks which of my teams owns it
- [x] `/forms` lists forms of all my teams with the team shown; archived forms excluded
- [x] Name and recipients are editable; recipients are validated as email addresses
- [x] Recipient changes are recorded in the audit log

## Comments

**2026-10-05, agent:** Repo side done. All five criteria are met and tested against the migrations (PGlite). They still need the migration pushed and the cloud RLS checklist run, which needs a human (ADR-0006).

- **Database:** migration `supabase/migrations/20261005190000_forms.sql`.
  - `public.forms` has every column from blueprint §3: the draft fields, `current_version` (null until the first publish), `is_closed`, `archived_at`, `recipients`, and the rest, with the blueprint defaults. Names are 1–200 characters after trimming, `sender_display_name` at most 100.
  - `recipients` is an array of the new domain `public.email_address`, so the database checks every element: lower-case, at most 254 characters, one `@`, no spaces, a dot in the domain. At most 20 per form, no nulls.
  - `team_id` has no cascade (`on delete restrict`): deleting a team must not silently take its forms with it.
  - RLS: members of the owning team and Super Admins see, create and change forms. Grants are per column. You can insert only `team_id` and `name`, and update only `name` and `recipients`. The other columns get write paths with the tickets that own them (08, 09, 19, 23, 24). Nobody can delete a form or move it to another team. Anon has no access.
  - Audit: triggers record `form.created` (name), `form.renamed` (from/to) and `form.recipients_changed` (name, from/to list). Each entry commits with its change, and a save that changes nothing records nothing. Recipients can't be set on insert, so every list shows up as a change.
- **Dashboard:**
  - `/forms` lists the forms of all your teams, every team's for a Super Admin, without archived ones. It shows name, team, a status badge (*Entwurf*, *Veröffentlicht*, *Geschlossen*) and the date of the last change.
  - *+ Formular anlegen* opens a drawer that asks for a name and which of your teams owns the form. With one team, that team is preselected. Without a team there is no button, and the empty state says why. Saving opens the new form.
  - `/forms/[id]` shows name, ID, team (with a link), status and creation date, plus a settings section with name and recipients. Recipients go one per line; commas and semicolons work too. They are stored lower-case, each once, and an invalid entry is named in the German error. *Speichern* is disabled until something changed. A form you can't see gives *Formular nicht gefunden*.
  - The audit log shows the new entries in German, for recipients as `+ added, − removed`.
- **Small refactors:** `normalizeEmail`, the email check and the UUID check moved to `lib/shared/` (`email.ts`, `uuid.ts`), so later the dispatcher can use the same rule for Reply-To. `lib/members` and `lib/teams` use them unchanged.
- **RLS checklist:** `supabase/snippets/rls-checklist-teams.sql` now has 25 checks.
  - 20: members see only their team's forms.
  - 21: members create forms only for their own team.
  - 22: members change recipients only in their own team.
  - 23: the Team Admin sees that change in the log.
  - 24: no moving, deleting, or writing columns without a write path.
  - 25: the Super Admin sees all forms.
  - 4 and 9 now cover forms too.

  Two new tests show the checklist fails on a leaking policy and on a missing audit trigger.
- **Checks:**
  - `npm test` passes: 160 tests. New are 22 DB tests, 2 checklist tests, and 19 for helpers and audit wording.
  - `npm run typecheck`, Biome and `next build` pass.
  - Not tested in a browser: the pages need an account, and the migration isn't on the cloud project yet.
- **Review:** two-axis review, no missing criteria and no hard violations. Fixed:
  - Insert could set recipients without an audit entry.
  - The DB now enforces lower case.
  - The checklist checks columns without a write path.
  - The settings form follows the page after a refresh.
  - `FormActionState` naming, and no re-export of `normalizeEmail`.

  Left as is: the duplicated drawer footer, table header and `42501` constant across teams, members and forms. A shared component is a separate refactor.

For the human, in this order:

1. Run `npm run db:push`, which applies the forms migration. **Do this before using the dashboard against the cloud again**, because `/forms` now queries the table.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 25 of 25 checks`.
3. As a team member, create a form on `/forms` and pick the team. Check that it opens on its page and shows in the list with its team.
4. On the form's page:
   - Enter `kurse@drk-rostock.de` and `quatsch` as recipients. *Speichern* should name `„quatsch“` as invalid.
   - Remove that line and save. You should see *Gespeichert.*
   - Rename the form.
5. As the team's Team Admin, open the team page's *Audit-Log*. Check for *Formular angelegt*, *Empfänger geändert* (`+ kurse@drk-rostock.de`) and *Formular umbenannt*, with the member as actor.
6. Log in as a member of another team. Check that the form isn't listed and its URL shows *Formular nicht gefunden*.

Open points for the reviewer:

- **Limits nobody asked for:** at most 20 recipients, names up to 200 characters, sender name up to 100. These are easy to change in the migration and in `lib/forms/`.
- **Beyond the criteria:** the `form.created` and `form.renamed` entries (blueprint §3 lists "form-setting changes"), the status badge, and the team link.
- **No recipients is allowed.** A new form has none. Publishing (ticket 09) or the dispatcher should probably refuse a form without recipients.
- **Archived forms** are hidden from `/forms` but still open and editable by URL. Ticket 24 owns the archive filter and whether archived forms stay editable.
- **Breadcrumbs** on `/forms/[id]` show only *Formulare*, not the team and form (ui-design §4). The shell doesn't know forms yet; the sidebar tree team → forms could come with it.
- **Duplicates through the Data API:** the database enforces lower case but not uniqueness within a list (a check constraint can't do that). The dashboard deduplicates.
- **Test seams.** The DB as each role, plus pure helpers (`parseRecipients`, `formNameProblem`, `formStatus`, audit wording). These are the seams the repo already uses; I did not agree them beforehand.

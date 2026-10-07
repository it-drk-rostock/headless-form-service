# 25: Form passes in the dashboard

**What to build:** Team members make a form protected, set its form page, and create form passes with an optional use limit, optional expiry and optional pass metadata (flat string/number values, no personal data). The secret link is shown only once; passes are stored hashed. Passes can be listed and revoked.

**Blocked by:** 06 (Audit log), 07 (Create forms & form settings)

**Status:** ready-for-human

- [x] Access type and form page settings on the form
- [x] `form_passes` table with token hash, use limit, use count, expiry, revoked, source, metadata
- [x] Creation shows `<form page>?form_pass=<secret>` once with a copy button
- [x] Metadata is validated as flat string/number values
- [x] The list shows status (valid, used up, expired, revoked) without secrets; revoking works
- [x] Creation and revocation are recorded in the audit log

## Comments

**2026-10-07, agent:** The repo work is done. All six criteria are met and tested against the migrations (PGlite). The migration still needs pushing by a human (ADR-0006). No edge function changed: `/load-form` and `/submit-form` still answer 403 for every protected form until ticket 26.

- **Database:** migration `20261008110000_form_passes.sql`.
  - `forms.access_type` and `forms.page_url` are now writable by members of the owning team and by Super Admins. A new constraint, `forms_page_url_check`, allows only http(s) addresses of at most 2000 characters.
  - New table `public.form_passes` with these columns: `token_hash` (unique, 64 hex characters), `max_uses` (null = unlimited), `use_count`, `expires_at`, `revoked_at`, `source` (`dashboard` | `n8n`), `created_by`, `metadata`, `created_at`. Constraints:
    - `use_count` stays between 0 and `max_uses`.
    - The expiry must come after creation.
    - The metadata must pass `private.is_pass_metadata()`: at most 20 entries, each a string (≤ 500 characters) or a number, under keys matching `[A-Za-z0-9_-]{1,50}`.
    - Passes are deleted with their form (cascade).
  - Members read every column except `token_hash`. Nobody signed in writes the table directly. Anon has no access.
  - `public.create_form_pass(form, token_hash, max_uses, expires_at, metadata)` takes only the hash and refuses public forms with `HF010`. `public.revoke_form_pass(pass)` keeps the first revocation time. Both are open to members of the form's team and to Super Admins.
  - The audit log records `form_pass.created` (form name, use limit, expiry and source; no hash, no metadata), `form_pass.revoked`, `form.access_changed` and `form.page_changed`. Triggers write them in the same transaction.
- **Shared:** `lib/shared/form-pass.ts` makes the secret (256 bits, base64url), the SHA-256 hex hash and the link, and validates metadata. It uses only Web APIs, so tickets 26–29 can reuse it in the edge functions.
- **Dashboard:**
  - In *Einstellungen*: *Zugang* (*Öffentlich · Geschützt*) and *Formularseite*.
  - A new view, *Pässe* (`?view=passes`), lists the passes with created date and creator, uses, *Gültig bis*, metadata, and a status badge (*Gültig*, *Aufgebraucht*, *Abgelaufen*, *Widerrufen*).
  - *+ Pass anlegen* opens a drawer:
    - Fields: use limit (default 1, empty = unlimited, at most 10,000) and validity in hours (default 48, empty = no expiry, at most 8,760), plus metadata rows.
    - It then shows the link once, with *Kopieren*.
  - *Widerrufen* (subtle red, confirmed in a modal) appears only on valid passes.
- **RLS checklist:** now 44 checks.
  - New check 43: a member protects their own team's form, creates and revokes a pass, cannot read hashes, cannot write the table, and cannot create a pass for another team's form. Another team's member cannot see or revoke it.
  - New check 44: the Team Admin sees the creation and revocation in the log.
  - Check 9 also tries both functions as anon.
  - Three tests show the checklist catches each of these: a revoke open to everyone, readable hashes, and unlogged revocation.
- **Docs:** the README has a new section, *Form passes*.
- **Checks:**
  - `npm test`: 799 tests, all passing (`--maxWorkers=4`).
  - New: 20 DB tests (`supabase/tests/form-passes.test.ts`), 3 checklist tests, and unit tests for the secret, hash, link, metadata, input parsing, status and audit wording.
  - `npm run typecheck`, Biome and `npm run build` pass.
  - **Not checked in a browser.** The dev server uses the cloud database, where the migration is not pushed yet, and signing in needs a real account. Everything in the steps below is unverified in a browser.
- **Review (two axes):** nothing from the spec is missing. Fixed after review:
  - a wrong file reference in the migration
  - duplicated object check and key length
  - a `FormPassSource` type
  - naming
  - comment wrap
  
  Left as is (judgement calls):
  - The action checks "protected" before the database does too, so no secret is made for a public form. The database check covers races.
  - The revoke modal is a third copy of the confirm-modal shell (after `DraftReset` and `FormLifecycle`). Extracting a shared one is still open.
  - `audit_form_change()` is rewritten whole again.

For the human, in this order:

1. Run `npm run db:push` to apply the form pass migration, then rebuild/redeploy the dashboard. Without it, every form page fails to load, because the *Pässe* view reads `form_passes`.
2. In the Supabase SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 44 of 44 checks`.
3. As a team member, open a test form, go to *Einstellungen*, set *Zugang* to *Geschützt*, and enter a *Formularseite* (e.g. the embed's test page). Save. Note: the embed now refuses this form until ticket 26.
4. Open *Pässe*. Click *+ Pass anlegen*, keep 1 use and 48 hours, and add metadata `ticket` = `T-1`. Click *Anlegen*. The link `<Formularseite>?form_pass=…` shows once. *Kopieren* copies it. After *Fertig*, the link cannot be shown again.
5. The list shows the pass as *Gültig*, `0 von 1`, with expiry and `ticket: T-1`. Try a key with a space: you get a German error, and no pass is created.
6. Click *Widerrufen* and confirm. The status turns *Widerrufen*, and the button goes away.
7. Remove the *Formularseite*: *+ Pass anlegen* is disabled, with a hint. Set *Zugang* back to *Öffentlich*: the view says passes are only for protected forms but still lists the old passes.
8. As the Team Admin, open the team's *Audit-Log*. You should see *Zugang geändert*, *Formularseite geändert*, *Pass angelegt* (with uses and expiry) and *Pass widerrufen*.

Open points for the reviewer:

- **No pass without a form page in the dashboard.** The ticket says creation shows `<form page>?form_pass=<secret>`, so the dashboard requires a page. The database does not, because n8n (§7) may create passes without one. Say if the dashboard should show the bare secret instead.
- **Dashboard metadata values are always text.** Numbers are allowed by the database and by n8n, but the dashboard never sends one. `{{pass.*}}` renders both the same.
- **Dashboard-only caps** of 10,000 uses and one year of validity. Neither the spec nor ticket 29 has them.
- **No "expiring soon" status.** ui-design §2.3 lists orange for "pass expiring", but the ticket asks only for the four statuses.
- **The form page is not checked against the allowed origins.** Members cannot read the settings.
- **Ticket 29** must insert into `form_passes` with the secret key and `source = 'n8n'`. `create_form_pass` is for the dashboard only and always records `dashboard`.
- **Test seams:** the DB as each role, plus pure helpers. These are the repo's existing seams; I did not agree them beforehand.

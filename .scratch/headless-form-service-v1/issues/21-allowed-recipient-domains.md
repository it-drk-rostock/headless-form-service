# 21: Allowed recipient domains

**What to build:** Submissions can't be redirected to private mailboxes: a Super Admin maintains a list of allowed recipient domains, and recipients outside it are rejected.

**Blocked by:** 07 (Create forms & form settings), 20 (Global settings page)

**Status:** ready-for-human

- [x] Allowed recipient domains editable in global settings
- [x] Saving a recipient outside the allowed domains fails with a German message
- [x] The dispatcher refuses to send to non-allowed recipients (defence in depth)

## Comments

**2026-10-07, agent:** The repo work is done. All three criteria are met and tested. Before it works live, a human has to push the migration and redeploy `/dispatch-email` (ADR-0006).

- **Database:** migration `20261007180000_allowed_recipient_domains.sql`.
  - New column `settings.allowed_recipient_domains`. The check allows lower-case domains (at least two labels of letters, digits and hyphens), no empty entries, at most 100. The list starts as `drk-rostock.de`. Super Admins may update it (column grant; the RLS from ticket 20 applies).
  - Trigger `private.check_recipient_domains()` on `forms`. It runs before insert, and before update when the recipient list changes, and for every writer (members, Super Admins, the secret key). It refuses an address whose domain is not on the list exactly: SQLSTATE `HF006`, with the first such address as detail. An empty list refuses every recipient.
  - Audit `settings.recipient_domains_changed` with `from`/`to` (*Erlaubte Empfänger-Domains geändert*, shows `+`/`−`). The audit function and trigger are re-created to include the column.
  - `dispatch_submission` now also returns the current domain list.
- **Settings page:** a new textarea *Erlaubte Empfänger-Domains* between the websites and the limits, with an orange note when empty. `parseRecipientDomains` (`lib/settings/recipient-domains.ts`):
  - takes one domain per line, or separated by commas, semicolons or spaces;
  - drops a leading `@` and lower-cases;
  - keeps each domain once, at most 100;
  - names a bad entry, such as a whole address, a wildcard, `https://`, an umlaut, or a missing dot.
- **Form settings:** saving a recipient outside the list shows *„erika@gmail.com“ gehört zu keiner erlaubten Empfänger-Domain. Einsendungen dürfen nicht an private Postfächer gehen; weitere Domains gibt ein Super Admin in den Einstellungen frei.* The database decides, since members cannot read the settings; `updateFormSettings` maps `HF006` to that message.
- **Dispatcher (defence in depth):** `/dispatch-email` sends only to recipients on the list as it is at delivery (`splitByAllowedDomain`, `lib/shared/recipient-domains.ts`). It logs how many were skipped, never who. With none left it answers 422 `recipients_not_allowed` and sends nothing.
- **RLS checklist:**
  - New check 35: a member cannot save a recipient outside the domains. A test shows the check catches a missing trigger.
  - Check 33 also covers a Team Admin changing the domain list.
  - The setup allows `example.invalid` for checks 22 and 23 (rolled back). Now 35 of 35.
- **README:** *Global settings*, *Forms* and *Delivering submissions* are updated.
- **Checks:**
  - `npm test`: 686 tests. New tests: DB 21, parser 15, domain rule 10, dispatcher 2, audit wording 1, checklist 1.
  - **Flaky DB tests:** the full parallel run had the known PGlite `beforeEach` timeouts in 3 files (first test of each; `Hook timed out in 10000ms`). The DB tests with `--maxWorkers=4` pass in full (240), and the other 446 tests pass.
  - `npm run typecheck`, Biome on the changed files and `next build` pass.
  - **Browser:** I used a temporary unauthenticated route, since deleted, rendering the settings form. I checked:
    - the new field and its hint;
    - *Speichern* enabling on an edit;
    - `kurse@gmail.com` refused with the German message naming it;
    - no console errors.

    I did not check a real save or the form settings message in the browser, which need an account and the migration. Not run: `deno check`.
- **Review (two axes).** Fixed:
  - `allowedRecipients` was renamed to `splitByAllowedDomain`;
  - the "same rule" comments now say what the SQL relies on (lower case, single `@`);
  - the trigger comment wording.

  Left as is (judgement calls):
  - the split/dedupe/cap loop and the textarea block are copied from the origins (a shared helper or `ListTextarea` once a third list arrives);
  - one new setting still touches types, query, action, form, i18n and audit (the field-map refactor noted in ticket 20);
  - the Team Admin domain assertion shares number 33 with the origins one;
  - 422 for "no allowed recipient" makes QStash retry, like "no recipients" (ticket 30 marks it failed).

For the human, in this order:

1. In the SQL editor, find forms whose recipients would be refused:
   `select f.name, r from public.forms f, unnest(f.recipients::text[]) r where split_part(r, '@', 2) <> 'drk-rostock.de';`
   Note the domains you want to allow (step 4). Until then, those recipients get no email.
2. Run `npm run db:push`, then `npx supabase functions deploy dispatch-email`.
3. Run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 35 of 35 checks`.
4. As Super Admin, on `/settings`:
   - The field *Erlaubte Empfänger-Domains* shows `drk-rostock.de`.
   - `kurse@gmail.com` is refused with a message naming it.
   - Add the domains from step 1, if wanted, and save. You should see *Gespeichert*.
5. As a team member, on a form's settings, enter `erika@gmail.com` as a recipient. *Speichern* should show the German message naming it. A `@drk-rostock.de` address saves.
6. Send a test submission to a form with a `@drk-rostock.de` recipient. The email arrives.
7. Open `/audit-log`. You should see *Erlaubte Empfänger-Domains geändert*, if you changed the list in step 4.

Open points for the reviewer:

- **Exact match only.** `kv.drk-rostock.de` needs its own entry next to `drk-rostock.de`. Matching subdomains automatically would be a one-line change in both rules.
- **Seed `drk-rostock.de`.** This is my assumption for the organisation's domain. Other existing recipient domains are not carried over on purpose, since they could be private mailboxes.
- **Removing a domain** leaves forms whose recipients are on it. They keep their other settings editable, but they cannot save a changed recipient list until it is fixed, and those recipients get no email. The settings page does not warn which forms are affected; a warning could be added.
- **Partial sends** go to the allowed recipients only, with a log line. The form owner sees nothing in the dashboard.
- **International domains** (umlauts) are refused in the list. Email recipients are stored as typed, not in punycode, so such a domain could never match.


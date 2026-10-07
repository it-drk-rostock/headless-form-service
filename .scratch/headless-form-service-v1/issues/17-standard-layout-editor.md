# 17: Standard Layout editor

**What to build:** Team members design the notification email in the DRK Rostock-branded Standard Layout: a subject line plus a Mantine Tiptap WYSIWYG body. The editor lists the draft's SurveyJS questions for insertion as placeholders, plus basic elements (headings, text, lists, links, divider, answers table). A sandboxed iframe preview renders sample values through the shared renderer. The template lives in the draft and is versioned on publish (ADR-0003).

**Blocked by:** 09 (Publishing), 13 (Dispatcher sends the notification email)

**Status:** ready-for-human

- [x] The renderer supports the namespaced placeholders `{{answers.*}}`, `{{form.name}}`, `{{submitted_at}}`, `{{answers_table}}`
- [x] The question list comes from the draft's questions; inserting adds the placeholder
- [x] The preview uses the same shared renderer as the dispatcher
- [x] The dispatcher uses the template of the submitted version
- [x] Unknown placeholders are visibly flagged in the editor
- [x] Renderer tests for each namespace

## Comments

**2026-10-07, agent:** Repo side done. All six criteria are met and tested. A human still needs to push the migration and redeploy `dispatch-email` (ADR-0006).

- **Editor choice:** Mantine Tiptap (`@mantine/tiptap` 9.6.3, Tiptap 3.31.4), as blueprint §5.2 says. I looked at the two alternatives that were suggested:
  - **Unlayer** (`react-email-editor`) loads its editor from Unlayer's servers in an iframe and needs an Unlayer project. That puts a non-EU processor in the dashboard (ADR-0002). Its free drag-and-drop layout also works against a *fixed* branded layout.
  - **React Email's editor** builds whole emails. Here the layout is fixed and only the body is edited, which is what Tiptap does. React Email's editor is itself built on Tiptap. If a full builder is wanted later, the stored HTML body carries over.
- **Renderer** (`lib/shared/notification.ts`, shared by the dispatcher and the preview):
  - `{{answers.<question>}}` shows the answer the way the answers table does: choice texts, "Sonstiges: …", Ja/Nein, German numbers.
    - In the body it is escaped, and line breaks are kept.
    - In the subject it is plain text on one line.
    - An unanswered question gives an empty string.
  - Names may contain spaces, umlauts and `&`. Names in the body are read unescaped, because Tiptap stores `&` as `&amp;` and double spaces as `&nbsp;`.
  - `<p>{{answers_table}}</p>` is how Tiptap stores the answers table. The renderer replaces that whole paragraph with the table, so no table ends up inside a `<p>`.
  - Unknown placeholders stay as written, as before. That includes `{{pass.*}}` until ticket 28, and questions a later version renamed.
  - **Standard Layout:**
    - a red `#E60005` header with "DRK Rostock";
    - the body on a white card, at most 640px wide;
    - a grey footer saying the email was sent automatically;
    - built with tables and inline styles;
    - no emblem (ui-design §7). Swap in the official logo once the files exist.
  - New exports: `answerPlaceholders`, `knownPlaceholders`, `unknownPlaceholders`, `findPlaceholders`, and the shared placeholder names (`FORM_NAME`, `SUBMITTED_AT`, `ANSWERS_TABLE`, `placeholderText`, `fitsSubject`).
- **Database:** migration `20261007090000_email_template.sql`.
  - `grant update (draft_email_template)` to `authenticated`.
    - The existing forms policy limits which rows can be changed.
    - The existing `stamp_draft` trigger records who saved and when.
  - Check `forms_draft_email_template_shape_check`:
    - `mode = 'standard'`;
    - subject and body are strings;
    - subject at most 250 characters, body at most 100,000.

    **Ticket 18 has to widen `mode`.**
  - Not audited, like the draft questions. The log records publishing.
  - RLS checklist check 26 now also covers saving the template, and that another team's template can't be saved. Still 32 checks.
- **Dashboard (`/forms/[id]?view=email`):** a new view, *E-Mail*, between *Designer* and *Einstellungen*. *Veröffentlichen* sits next to it, as in the designer.
  - **Fields and toolbar:** a *Betreff* field, and the Tiptap body with these tools:
    - bold, italic, underline;
    - H2, H3;
    - bullet and numbered lists;
    - link and unlink;
    - divider;
    - answers table;
    - undo, redo.
  - ***Platzhalter einfügen*** lists the draft's questions by title, then form name, time of submission and answers table.
    - It inserts where the cursor was last, in the subject or the body.
    - The answers table only goes into the body.
  - **The question list follows the designer.** Both views now share, through `DraftStatus`:
    - the last-saved questions;
    - the "saved by" stamp;
    - the unsaved flags.

    A question saved in the designer shows up in the list at once.
  - **Unknown placeholders** are flagged in three ways:
    - inline in the body: orange, with a wavy underline;
    - the subject field gets an orange border;
    - an orange box lists them all.

    A placeholder with formatting inside it is flagged too, because the renderer can't fill it. Known placeholders get a grey monospace background.
  - **Autosave:**
    - runs 0.8 s after the last change;
    - a save that fails for a technical reason is retried after 5 s;
    - publishing waits until both editors have saved.
  - **Preview:**
    - a sandboxed `<iframe sandbox="">` showing the output of `renderNotificationEmail`;
    - sample answers of the right kind for each question type (`sampleAnswers`);
    - the rendered subject above it.
- **Checks:**
  - `npm test` passes, 536 tests. New tests cover:
    - the renderer: answers, escaping, line breaks, subject, unanswered questions, entity names, the answers table in a paragraph, the layout, placeholder lists and unknown detection;
    - template validation and sample answers;
    - the database (10 tests), including that the dispatcher gets the submitted version's template and not a later one;
    - a dispatcher handler test that renders answers.
  - `npm run typecheck`, Biome and `next build` pass.
  - **Browser, partly.** I rendered the editor with a fake form ID on a temporary unauthenticated route, since deleted. There I checked:
    - the layout, side by side;
    - the inline highlights and the warning box;
    - inserting into the body and into the subject;
    - the preview with sample answers;
    - that autosave runs (it answers *forbidden* for the fake ID);
    - that a placeholder with formatting inside is flagged.

    I did not check the real page, which needs an account and the migration.
  - Not run: `deno check`.
- **Review (two axes).** Fixed:
  - Placeholders with formatting inside showed as known.
  - Question names with `&` or double spaces were never filled.
  - A failed autosave was never retried.
  - The preview rendered twice per keystroke.
  - Placeholder names were spelled out in several places.
  - `saveDraft` and `saveEmailTemplate` were duplicates. They now share `updateDraft`.
  - The i18n key `editor.linkPlaceholder` clashed with the glossary term.

  Left as is:
  - `DraftStatus` now holds more than the status. I did not rename it.
  - The 250 and 100,000 limits exist in both TS and SQL, each pointing to the other in a comment.

For the human, in this order:

1. Run `npm run db:push`. **Without it, saving the email template fails**, because the update grant is missing.
2. In the SQL editor, run `supabase/snippets/rls-checklist-teams.sql`. Expect 32 of 32.
3. Run `npm run functions:deploy -- dispatch-email`. The shared renderer changed: answer placeholders and the branded layout.
4. Open a form and switch to *E-Mail*.
   - It should show the default template: subject *Neue Einsendung: {{form.name}}*, a greeting, and `{{answers_table}}`. All placeholders should be grey.
   - The preview should show the red DRK Rostock header and an answers table filled with sample answers.
5. Put the cursor in the body and choose *Platzhalter einfügen* → a question. `{{answers.<name>}}` should appear, and the preview should fill it in.
6. Type `{{answers.gibtsnicht}}` in the body and in the subject. Both should turn orange, and the orange box should list them.
7. Add a question in the designer, then go back to *E-Mail*. It should be in the menu straight away.
8. Publish, then submit the form on the TYPO3 test page. The email should arrive in the branded layout, with the inserted answer filled in.
9. Test that old submissions keep their version's template (ADR-0003):
   1. Keep the TYPO3 page open in a tab.
   2. Change the template and publish again.
   3. Submit from the tab you kept open.

   That email should use the old version's template.

Open points for the reviewer:

- **An answers table typed inline isn't flagged.** Typed mid-sentence, or wrapped in bold, `{{answers_table}}` still renders, but as a table inside a `<p>`. Browsers close the paragraph before the table; some mail clients may not. The toolbar button and the menu always insert it as a paragraph of its own.
- **Inserting a placeholder can push the subject past 250 characters.** The save is then refused with the length message.
- **Some German text is hardcoded, not in i18n keys.**
  - The sample answers (`Beispielantwort`, …).
  - The email layout's footer. That one is email content rather than dashboard UI.
- **A subject is now required.** The spec doesn't ask for it, but an email without a subject is easy to miss.

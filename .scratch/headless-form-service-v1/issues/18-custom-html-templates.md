# 18: Custom HTML templates

**What to build:** Authors who need full control switch a template to Custom HTML and write the whole email themselves, with the same placeholders and preview.

**Blocked by:** 17 (Standard Layout editor)

**Status:** ready-for-human

- [x] Template mode switch between Standard Layout and Custom HTML
- [x] Author HTML is used as-is; inserted values are still escaped
- [x] Preview and dispatch both work for Custom HTML

## Comments

**2026-10-07, agent:** The repo work is done. All three criteria are met and tested. Before it works live, a human has to push the migration and redeploy `dispatch-email` (ADR-0006).

- **Stored shape:** `{ mode, subject, body }` as before (blueprint §5.2). `mode` is now `"standard"` or `"custom"`. In Custom HTML, `body` holds the whole email.
- **Renderer** (`lib/shared/notification.ts`, used by both the dispatcher and the preview):
  - **Custom HTML:** the body is sent exactly as written. There is no layout around it, and `<p>{{answers_table}}</p>` is not unwrapped.
  - **Placeholders:** the same ones work in both modes. Inserted values are escaped in both, so they are also safe inside quoted attributes (tested).
  - **The subject** is plain text, as before.
  - **`standardLayoutHtml(body)`** is the Standard Layout, its placeholders still unfilled. It is now spread over several lines, so it reads well as a starting point. The whitespace of Standard emails changes, but nothing visible.
  - **`isEmailTemplateMode`** is a new export.
- **Database:** migration `20261007120000_custom_html_template.sql`.
  - It widens `forms_draft_email_template_shape_check` to `mode in ('standard', 'custom')`.
  - The limits stay the same.
  - Publishing already copies the template as it is. `form_versions` only checks that it is an object.
- **Dashboard (*E-Mail* view):**
  - **Switch:** a new *Vorlage* switch offers *Standard-Layout* and *Eigenes HTML*.
  - **Standard → Custom:** the HTML starts as the email the Standard Layout would send, with the current body inside. The preview stays the same at first.
  - **Custom → Standard:** a modal asks first, because the HTML is discarded. The Standard body is restored:
    - as it was before the switch, if the page wasn't reloaded in between;
    - otherwise the default body (`DEFAULT_STANDARD_BODY`, which is checked against the SQL default by a DB test).
  - **HTML editing:** the HTML is a monospace textarea. *Platzhalter einfügen* inserts at the cursor in the HTML or the subject, and the cursor moves to just after the insert.
  - **Unknown placeholders:** the orange box lists them, and the field gets an orange border.
  - **Preview:** the same sandboxed iframe as before.
- **Fixed along the way (ticket 17):**
  - The orange border on unknown placeholders now goes through Mantine's `--input-bd` variable. Before, `border-color` could lose to Mantine's own rule.
  - The preview now also defers the mode, so a body is never rendered in the other mode.
- **Checks:**
  - `npm test` passes, 542 tests. New tests cover:
    - the renderer for Custom HTML: used as-is, escaping in text and attributes, unknown placeholders;
    - that starting from the layout renders the same as the Standard template;
    - `parseEmailTemplate` with `custom`;
    - the DB: a Custom HTML template saves, and the default body matches.
  - **Flaky DB tests:** in a full parallel run, the PGlite DB tests sometimes time out in their `beforeEach` (10 s). This happens on the base commit too, and each file passes alone.
  - `npm run typecheck`, Biome and `next build` pass.
  - **Browser:** I used a temporary unauthenticated route, since deleted, with autosave stubbed out. There I checked:
    - switching to Custom HTML, and what it saves;
    - editing the HTML and the live preview;
    - inserting at the cursor;
    - the orange box and border;
    - the confirm modal, and switching back to the earlier Standard body;
    - loading a template that is already Custom HTML.

    I did not check the real page, which needs an account and the migration. Not run: `deno check`.
- **Review (two axes).** Fixed:
  - The red confirm button had no icon (ui-design §2.3).
  - A type guard replaces the mode casts.
  - The mode-switch code was duplicated.
  - Two names were unclear.
  - The preview did not defer the mode.

For the human, in this order:

1. Run `npm run db:push`. **Without it, saving a Custom HTML template fails** the shape check.
2. Run `npm run functions:deploy -- dispatch-email`. **Without it, every submission to a published Custom HTML form fails** with `template_invalid`. Standard emails also change, but only in their whitespace.
3. Open a form, go to *E-Mail*, and choose *Eigenes HTML*. The HTML field should show the branded layout, and the preview should look the same as before.
4. Change the HTML, for example a heading with `style="color:green"`. Insert a question with *Platzhalter einfügen*. The preview should follow, with the sample answer in place.
5. Type `{{answers.gibtsnicht}}` into the HTML. The field should get an orange border, and the box should list it.
6. Publish, then submit on the TYPO3 test page. The email should arrive in your own HTML, with the answer filled in.
7. Enter an answer with `<b>` and `"` in it. The email should show those characters as text.
8. Choose *Standard-Layout* and confirm. You should get your earlier Standard body back, or the default body if you reloaded in between.

Open points for the reviewer:

- **Switching to Standard discards the HTML,** and after a reload the earlier Standard body is gone too. Only one `body` is stored, as blueprint §5.2 describes. Storing both bodies would avoid the loss, but it would change the shape.
- **"Inserted values are escaped" means HTML escaping.** That is safe in text and in quoted attributes. It is not safe in:
  - unquoted attributes;
  - `<style>` or `<script>`;
  - `href="{{answers.x}}"`, where a visitor could enter a `javascript:` link.

  The author's HTML is trusted (§5.2), so I left these alone. A multi-line answer inside an attribute gets a literal `<br>`, which is harmless.
- **`<p>{{answers_table}}</p>` stays a paragraph in Custom HTML,** because the HTML is used as-is. Browsers handle it. The layout that the HTML starts from has the bare placeholder.
- **Limits in two places:** the 250 and 100,000 limits now appear in two SQL migrations as well as in TS.

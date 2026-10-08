# 28: Pass metadata in emails

**What to build:** Notification emails can include context from the form pass, e.g. a ticket or campaign ID, via `{{pass.*}}` placeholders.

**Blocked by:** 17 (Standard Layout editor), 27 (Protected submission)

**Status:** ready-for-human

- [x] The renderer resolves `{{pass.<key>}}` from the claimed pass's metadata
- [x] The editor offers `pass.*` placeholders for protected forms
- [x] Missing keys render empty
- [x] Renderer tests

## Comments

**2026-10-08, agent:** Implementation is done and ready for human review. The parent spec is `docs/technical_blueprint.md` (§4.4, §5.1, §5.3). There is no feature-local `spec.md`. No migration is needed.

- **Renderer** (`lib/shared/notification.ts`):
  - `NotificationContext.passMetadata` is optional.
  - With a form pass, `{{pass.<key>}}` is filled from that pass's metadata. It is escaped in the body and plain text in the subject. Inserted values are never read again.
  - A key the pass lacks renders empty. That includes prototype names such as `constructor` (`Object.hasOwn`).
  - Numbers are shown as given (`1234567`), not with German digit grouping, because they are IDs.
  - Only keys a pass can have count (`isPassMetadataKey`, which `lib/shared/form-pass.ts` and the DB check share). `{{pass.}}` or `{{pass.mit leer}}` stay as written.
  - **Choice:** without a form pass (public form, or a message queued before ticket 27), `{{pass.*}}` stays as written. This is ticket 17's rule for unknown placeholders, and the editor flags it on public forms.
  - New exports: `passKey`, `passPlaceholders`. `knownPlaceholders` and `unknownPlaceholders` take an optional `withPasses`.
- **Dispatcher:**
  - After decrypting, `/dispatch-email` loads the pass's metadata by `pass_id` and form ID, using `loadPassMetadata`. `index.ts` reads `form_passes` with the secret key, as `/load-form` does.
  - It reads the pass as it is at delivery, not as it was at claim time. A pass that is gone gives empty values.
  - A load error answers 500, so QStash retries.
  - Public submissions load nothing.
- **Editor** (`/forms/[id]?view=email`):
  - For protected forms, *Platzhalter einfügen* has a *Formularpass* section listing every metadata key of the form's passes. If there are none, it says so.
  - A hint explains that other keys can be typed as `{{pass.<schlüssel>}}`, and that a key the pass lacks stays empty.
  - On protected forms, any valid typed key counts as known, because n8n passes (ticket 29) may carry keys no existing pass has. On public forms, `pass.*` is offered nowhere and is flagged orange.
  - The preview fills pass placeholders with *Beispielwert* through the shared renderer (`samplePassMetadata`).
  - Saving the settings refreshes the page, so switching the access type updates the editor.
- **Tests:**
  - Renderer: filling and escaping in subject and body, numbers, missing and prototype keys, no re-expansion, no pass, invalid keys, editor flagging for protected forms, `passPlaceholders`.
  - `samplePassMetadata`.
  - Dispatcher handler: fills from the claimed pass, a vanished pass gives empty values, a public submission loads nothing, a load failure answers 500 without sending.
- **Docs:** the README's *Delivering submissions* placeholder line is updated.
- **Validation:**
  - `npm test -- --maxWorkers=4` passes: **878 tests in 59 files**.
  - `npm run typecheck`, Biome on all changed TS files, `git diff --check` and `npm run build` pass.
  - Biome reports CRLF formatting on files checked out with `core.autocrlf=true`. That predates this change. The changed files were checked as LF, which is what git stores.
- **Browser, partly:** I rendered the real editor with fake data on a temporary unauthenticated route, since deleted. I checked:
  - Protected form: the *Formularpass* menu section and the hint; inserting `{{pass.ticket}}`; `{{pass.kampagne}}` and `{{pass.fehlt}}` highlighted as known; `{{pass.mit leer}}` flagged; the preview subject *Ticket Beispielwert* and the body filled.
  - Public form: no pass section, all `pass.*` flagged orange, the preview leaving them as written.
  - The real authenticated page and a real delivery were not checked.
  - Not run: `deno check`.

## Standards

Independent review against `20666a2`: **1 documented-standard finding, fixed**. The example `{{pass.<schlüssel>}}` was hard-coded German in the TSX. It now lives in the i18n message (ui-design: UI text goes through i18n keys).

Baseline smells, fixed:
- the prop `passNames` was a misleading name (now `passPlaceholders`);
- `PlaceholderOptions { passMetadata?: boolean }` shared its name with the metadata object, and an object with one option was speculative (now a plain `withPasses` boolean);
- "is the form protected" was spelled three ways in the editor (now derived once);
- `passText`'s type checks were unexplained (a comment now says they guard JSON read from the database).

Left as is: one boolean threaded from the page through the editor to the menu and preview. It follows the component split.

## Spec

Independent review: all four criteria are implemented, with **no scope creep** and **0 blocking findings**. Recorded judgement calls:

1. **"Missing keys render empty" applies only with a form pass.** A public submission leaves `{{pass.*}}` as written, so a form switched from protected to public sends literal braces. The editor flags them then.
2. **A typo such as `{{pass.tikcet}}` is not flagged on protected forms.** It renders empty. The editor can't know keys future n8n passes will carry. Flagging keys no existing pass has, perhaps more softly, is a possible follow-up.
3. **Metadata is read at delivery, not at claim time.** Only `pass_id` is encrypted, as §4.2 step 7 specifies. A QStash retry after the pass vanished gives empty values. Passes are deleted only with their form, which also stops delivery.

The concern that the editor would not update when the access type changes was checked. The settings save calls `refresh()`, so the page re-renders with new props.

Review totals: Standards 1 (fixed); Spec 0 blocking, 3 recorded judgement calls.

## Human review handoff

1. **Deploy.** Run `npm run functions:deploy -- dispatch-email`: the shared renderer and the dispatcher changed. Rebuild and redeploy the dashboard using the README's normal process (editor and preview). There is no migration or new secret. Tickets 25–27 must already be applied. This agent has not deployed to the shared cloud environment.
2. **Protected form, menu.** Open a protected form with at least one pass whose metadata has e.g. `ticket` and `kampagne`, then switch to *E-Mail*. *Platzhalter einfügen* should show a *Formularpass* section with those keys and the typing hint. Insert `{{pass.ticket}}` into the subject and the body. Both stay grey, and the preview shows *Beispielwert*.
3. **Protected form, typed keys.** Type `{{pass.anything}}`: it is grey (known). Type `{{pass.mit leer}}`: it is orange.
4. **Public form.** Open a public form. There is no *Formularpass* section, and a typed `{{pass.ticket}}` is flagged orange.
5. **Delivery.** Publish the protected form's template. Create a pass with metadata `ticket = T-4711` (`kampagne` may stay unset) and submit through its link on the allowed-origin test page. The email should show `T-4711` where `{{pass.ticket}}` was, and nothing where `{{pass.kampagne}}` was. Metadata with `<` or `&` should arrive escaped, as text.
6. **Public delivery.** Submit a public form whose template contains `{{pass.ticket}}`. The placeholder arrives as written, as the editor warned.
7. **Stop.** Stop after the ticket 28 review. No subsequent ticket was started.

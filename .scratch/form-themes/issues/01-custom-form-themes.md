# 01: Custom form themes from designer to embed

**What to build:** Let Team Members customize a form in the SurveyJS Theme tab, save and reload their draft, and publish that appearance to the embed. Make the custom/default choice part of the form version lifecycle. At this stage, inheritance uses the standard SurveyJS appearance; global themes are added by ticket 02.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Enable the Theme tab and provide an explicit choice between inheritance and a custom form theme. Existing drafts and versions without theme data inherit by default.
- [ ] Starting a custom theme copies the currently displayed standard SurveyJS appearance into an independent draft theme. Merely opening the designer, viewing the Theme tab, or saving questions does not create an override.
- [ ] Save and reload custom theme data separately from questions while preserving questions and the email template. Independent saves must not overwrite one another.
- [ ] Include theme saves in draft save status, error reporting, and publish coordination. Publishing waits for pending saves and does not publish stale theme data after a failed save.
- [ ] Publishing snapshots the custom theme or inheritance choice together with questions and the email template. Draft theme changes do not affect visitors.
- [ ] The public form-loading boundary returns the published appearance, and the embed applies it. Inheriting forms retain the standard SurveyJS appearance when no global theme is configured.
- [ ] Designer previews and embeds agree on appearance for the same theme choice.
- [ ] Switching back to inheritance removes the draft override and affects the embed only after publishing.
- [ ] Restoring an earlier version copies its custom theme or inheritance choice into the draft; discarding changes resets the draft to the current version's theme choice. Refresh the designer accordingly.
- [ ] Preserve team ownership and editing permissions, immutable published versions, and the existing public loading access boundary.
- [ ] Extend existing migrated-database tests for draft persistence, publishing, restore/discard, existing records, and permissions. Extend public load-handler and embed-load contract tests for theme transport and standard appearance fallback.
- [ ] Verify the designer-to-embed flow in a browser, including autosave/reload, draft isolation, pending/failed saves, publishing, returning to inheritance, and restore/discard. Test observable behavior rather than SurveyJS internals or CSS snapshots; do not introduce a new browser-test framework solely for this feature.

## Context

Implements the custom form theme portion of the Form themes spec and the agreed theme inheritance decision. SurveyJS 3.1.2 is installed and provides separate question and theme persistence APIs. Build on existing draft, version, public-load, and embed boundaries rather than creating parallel workflows.

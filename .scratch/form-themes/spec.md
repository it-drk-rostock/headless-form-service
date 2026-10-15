# Form themes

Status: needs-info

Feature behavior is agreed. Proposed testing boundaries await the check required by to-spec before this spec is marked ready-for-agent.

## Problem Statement

Team Members cannot customize a form's appearance in the designer and carry it through saving, publishing, and embedding. Super Admins need a shared default appearance without editing every form or preventing individual customization.

## Solution

Enable the Theme tab, save custom form themes with drafts and versions, and provide a global theme JSON field. Resolve appearance as form theme, current global theme, then standard SurveyJS appearance. Inheriting forms load the current global theme without copying it.

## User Stories

1. As a Team Member, I want a Theme tab, so that I can customize a form visually.
2. As a Team Member, I want theme edits saved with the draft, so that reopening the designer preserves my work.
3. As a Team Member, I want draft theme changes hidden from visitors, so that I can prepare changes before publishing.
4. As a Team Member, I want publishing to include the theme choice, so that the embed matches the appearance I approved.
5. As a Team Member, I want publishing to wait for theme saves, so that the latest edits are included.
6. As a Team Member, I want theme save progress and failures shown, so that I know whether my changes are stored.
7. As a Super Admin, I want a global theme JSON field, so that I can establish shared branding.
8. As a Super Admin, I want invalid theme input rejected without replacing the saved theme, so that mistakes do not affect forms.
9. As a Super Admin, I want to clear the global theme, so that inheriting forms return to the standard appearance.
10. As a Super Admin, I want global changes applied on subsequent loads, so that inheriting forms do not require republishing.
11. As a Team Member, I want forms without a custom theme to inherit, so that shared branding needs no duplicated configuration.
12. As a Team Member, I want forms with neither theme configured to use the SurveyJS default, so that existing forms remain usable.
13. As a Team Member, I want a custom form theme to take precedence, so that my form can have its own appearance.
14. As a Team Member, I want an explicit inheritance choice, so that opening or saving the designer does not accidentally create an override.
15. As a Team Member, I want customization to start from the displayed appearance, so that I can adjust the current design.
16. As a Team Member, I want custom themes independent of later global changes, so that my form keeps its chosen appearance.
17. As a Team Member, I want to return to inheritance, so that my form follows shared branding again after publishing.
18. As a Team Member, I want restoring a version to restore its theme choice into the draft, so that content and appearance choice stay together.
19. As a Team Member, I want discarding changes to reset the draft theme choice, so that unpublished appearance edits are discarded too.
20. As a Team Member, I want a restored inheriting version to use today's global theme, so that inheritance consistently follows current branding.
21. As a Team Member, I want previews to follow the embed's theme rules, so that I can assess the appearance before publishing.
22. As a Team Member, I want to preview the global theme without reading unrelated global settings, so that existing access boundaries are preserved.
23. As a visitor, I want the published theme choice applied to the embed, so that unpublished customizations never affect my form.
24. As a Super Admin, I want global theme changes restricted to my role, so that ordinary members cannot alter shared branding.

## Implementation Decisions

- Enable the SurveyJS Theme tab in the form designer and persist theme changes across saves and reloads.
- Provide an explicit choice between inheriting the default appearance and using a custom form theme.
- Resolve appearance in order: custom form theme, current global theme, standard SurveyJS appearance.
- Super Admins manage one global theme through a validated SurveyJS theme JSON field in global settings. Clearing it removes the global theme.
- Load the global theme when needed rather than copying it into inheriting forms. Global changes affect inheriting embeds on subsequent loads without republishing forms.
- Switching to a custom theme starts from a copy of the currently displayed appearance. That theme is independent of subsequent global changes; overrides replace rather than merge with the global theme.
- Switching back to inheritance removes the draft override and takes effect for visitors upon publishing.
- Save custom theme edits with the draft. Publishing snapshots the custom theme or inheritance choice along with questions and email template.
- Restoring a form version restores its custom theme or inheritance choice. Discarding changes restores the current version's theme choice.
- Inheritance always resolves against today's global theme, including after restoring an older inheriting version.
- Designer previews and embedded forms use the same precedence rules; visitors receive only the published form theme choice.

- SurveyJS 3.1.2 is installed. Theme tab is currently disabled; only creator.JSON is persisted. Theme persistence must handle creator.theme separately.
- Include theme saves in existing save-status and publish coordination so publishing waits for pending theme changes.
- Keep question, email template, and theme saves from overwriting one another; surface theme save failures through existing draft status.
- Existing drafts and versions without theme data inherit by default. Merely viewing the Theme tab or saving questions must not create a custom theme.
- When no global theme exists, starting a custom theme copies the standard SurveyJS appearance.
- Reject invalid global theme input without changing the saved value; preserve Super Admin-only write access.
- Extend draft, publish, restore, and discard paths consistently.
- Return the resolved theme through the existing public load-form boundary and apply it in the embed.
- Ordinary team members cannot read the complete global settings row. Provide a narrow way to read the global theme for designer previews.

## Testing Decisions

Proposed boundaries, pending the user's check:

- Use the existing migrated-database integration suites as the primary seam. Extend draft, publishing, version-history, and settings tests to cover theme persistence, inheritance, existing records, restore/discard, and role permissions.
- Extend the existing public load-handler and embed-load contract tests to cover transporting the published theme, override priority, later global changes without republishing, and absent themes. Assert resolution combinations at the owning boundary rather than duplicating every case in every layer.
- Add focused validation tests where theme validation adds meaningful behavior beyond parsing.
- Perform browser acceptance checks for inherited preview, creating a custom theme, autosave/reload, publishing, switching back to inheritance, and restore/discard. Verify pending and failed theme saves prevent publishing stale themes. Use existing browser capabilities rather than introducing a new browser-test framework solely for this feature.
- Good tests assert externally visible behavior, permissions, and saved/loaded results. Avoid SurveyJS internals, private helpers, source-text assertions, or generated CSS snapshots.
- Prior art: existing database tests use migrated PGlite databases and role helpers; public load-handler tests use dependency fakes; embed load tests use controlled fetch responses.

## Out of Scope

- A visual global theme editor, team-specific defaults, or a catalog of named themes.
- Partial merging of global and custom themes.
- Historical global theme restoration or copying global changes into individual versions.
- Live updates to embeds that are already open; global changes apply on subsequent loads.
- Styling the dashboard, Survey Creator's own interface, or notification emails.
- Changes to questions or submission handling beyond integrating themes with the existing form lifecycle.

## Further Notes

The theme priority, dynamic inheritance, JSON settings input, custom-theme copying, publishing, and restore/discard behavior were explicitly agreed in the design discussion. The theme inheritance ADR explains why an immutable version's appearance can change when it inherits.

- [Theme inheritance decision](../../docs/adr/0007-resolve-inherited-form-themes-at-load-time.md)
- [SurveyJS Theme Editor](https://surveyjs.io/survey-creator/examples/change-form-theme/documentation)

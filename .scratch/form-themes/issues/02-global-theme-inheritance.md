# 02: Global theme settings and inheritance

**What to build:** Let Super Admins configure one global SurveyJS theme through a JSON field. Forms without a custom theme load the current global theme in designer previews and embeds, without copying it into each form or republishing. A custom form theme always takes precedence.

**Blocked by:** 01: Custom form themes from designer to embed.

**Status:** ready-for-agent

- [ ] Add a global settings JSON field for one optional SurveyJS theme, writable only by Super Admins. Save and reload valid theme JSON and provide a way to clear it.
- [ ] Reject malformed or invalid theme input with a useful error and preserve the previously saved value when validation fails.
- [ ] Resolve appearance consistently in designer previews and embedded forms: custom form theme, current global theme, then standard SurveyJS appearance. Custom themes replace rather than partially merge with the global theme.
- [ ] Read the global theme at load time for inheriting forms. Changing or clearing it affects subsequent loads without updating individual forms, copying theme data into versions, or creating new form versions.
- [ ] Existing published forms with no custom theme inherit the global theme automatically. Already open embeds do not need live updates.
- [ ] Provide Team Members a narrow way to read the global theme for previews without exposing unrelated global settings or granting global write access.
- [ ] Starting a custom theme while inheriting copies the currently displayed effective theme into the draft. It remains independent of subsequent global changes; if no global theme exists, copy the standard SurveyJS appearance.
- [ ] Viewing or saving an inheriting form does not silently copy the global theme into a form override.
- [ ] Returning to inheritance removes the draft override; visitors see that change after publishing and then follow the current global theme.
- [ ] Restoring an inheriting version uses today's global theme, while restoring a custom version restores its own theme. Discarding changes preserves the current version's custom/inherited choice.
- [ ] Extend existing settings and version lifecycle integration tests for permissions, clearing, inheritance, override precedence, and global changes without republishing. Use focused validation tests where they verify meaningful behavior.
- [ ] Extend public load-handler and embed-load contract tests to verify the effective theme reaches visitors and unpublished customizations remain hidden. Test resolution combinations at their owning boundary rather than duplicating every combination at every layer.
- [ ] Verify global JSON save/clear, inherited previews, custom-theme copying, later global changes, and published embed rendering in a browser using existing browser capabilities.

## Context

Implements the global theme portion of the Form themes spec and the agreed theme inheritance decision. The existing global settings read is restricted to Super Admins; preserve that restriction while exposing only the theme where needed. Visual global editing, team defaults, named theme catalogs, historical global theme restoration, dashboard styling, and email styling are outside this feature.

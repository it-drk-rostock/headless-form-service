# Resolve inherited form themes at load time

Resolve a form's appearance in this order: its published form theme, the current global theme, then the standard SurveyJS appearance. Super Admins manage the global theme; inheriting forms load it rather than copying it, so global branding changes affect them on subsequent loads without republishing or updating individual forms.

Custom form theme edits follow the draft and publishing workflow. Form versions preserve their theme choice, but an inherited global theme is deliberately resolved at load time: an immutable version does not guarantee an immutable appearance when it inherits the global theme.

Starting a custom form theme copies the currently displayed appearance into an independent draft theme. Restoring a version restores its custom theme or inheritance choice; discarding changes restores the current version's theme choice. Neither operation restores an earlier global theme.

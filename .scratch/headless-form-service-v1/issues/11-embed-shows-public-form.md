# 11: `embed.js` shows a public form

**What to build:** An editor pastes a `data-form` div plus the `embed.js` script tag into a TYPO3 HTML field, and the page shows the form's current version. `embed.js` is built from the embed source and served by the dashboard.

**Blocked by:** 10 (`/load-form` endpoint)

**Status:** ready-for-agent

- [ ] The embed bundles the SurveyJS runner and theme; the build produces one script served at `/embed.js`
- [ ] Several embeds on one page work independently
- [ ] Loading errors show a German message instead of an empty box
- [ ] Verified on a TYPO3 page; CSP requirements documented for TYPO3 admins

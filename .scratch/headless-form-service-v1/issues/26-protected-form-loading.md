# 26: Protected form loading

**What to build:** Visitors with a valid form pass link see the protected form; everyone else gets a German 'link invalid or expired' message and never sees the questions.

**Blocked by:** 11 (`embed.js` shows a public form), 25 (Form passes in the dashboard)

**Status:** ready-for-agent

- [ ] The embed reads `form_pass` from the page URL
- [ ] `/load-form` validates the pass (not revoked, not expired, uses left) without consuming it
- [ ] Invalid or missing pass -> 403 and no questions returned
- [ ] Handler tests for each invalid case

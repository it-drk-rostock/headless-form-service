# 15: Turnstile & honeypot

**What to build:** Bots are kept out: the embed shows Cloudflare Turnstile when enabled on the form (default on) and includes a hidden honeypot field. `/submit-form` verifies Turnstile server-side and silently drops honeypot hits.

**Blocked by:** 12 (Submission is queued encrypted)

**Status:** ready-for-agent

- [ ] Per-form Turnstile toggle in form settings (default on)
- [ ] `/load-form` returns the site key when enabled; the embed renders the widget
- [ ] Missing or invalid Turnstile token -> rejected
- [ ] Filled honeypot -> 202 without queueing
- [ ] Handler tests with a fake verifier

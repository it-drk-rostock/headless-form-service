# 15: Turnstile & honeypot

**What to build:** Bots are kept out: the embed shows Cloudflare Turnstile when enabled on the form (default on) and includes a hidden honeypot field. `/submit-form` verifies Turnstile server-side and silently drops honeypot hits.

**Blocked by:** 12 (Submission is queued encrypted)

**Status:** ready-for-human

- [x] Per-form Turnstile toggle in form settings (default on)
- [x] `/load-form` returns the site key when enabled; the embed renders the widget
- [x] Missing or invalid Turnstile token -> rejected
- [x] Filled honeypot -> 202 without queueing
- [x] Handler tests with a fake verifier

## Comments

**2026-10-06, agent:** Repo side done. All five criteria are met and tested. A human still has to create the Turnstile widget, set two secrets, push the migration and deploy both functions (ADR-0006).

- **Database:** migration `supabase/migrations/20261006220000_turnstile.sql`.
  - `forms.turnstile_enabled` already existed (default true). Members of the owning team and Super Admins may now update it.
  - Switching it is audited as `form.turnstile_changed` (`{ name, enabled }`); the audit log shows "Bot-Schutz geändert", "<Name>: ein-/ausgeschaltet".
  - `load_form` and `submission_form` now also return `turnstile_enabled` (dropped and recreated, grants restored: `service_role` only).
- **Dashboard:** a switch *Bot-Schutz (Cloudflare Turnstile)* in the form's settings, saved with the same *Speichern*. Label left, toggle right (ui-design §5).
- **`/load-form`:** adds `turnstile_site_key` when the form has Turnstile on. The key comes from the secret `TURNSTILE_SITE_KEY`; the function refuses to start without it.
- **`/submit-form`:** order is CORS → rate limit → 405 → 400 → **honeypot** → 404 → **Turnstile** (if on) → protected 403 → queue.
  - A filled `honeypot` gets 202 `accepted` with nothing verified, queued or sent, and a log line with the form ID (no answers).
  - No token, or one Cloudflare refuses → 403 `turnstile_invalid`.
  - Cloudflare unreachable, no answer in 5 s, `internal-error` or a wrong secret → 503 `turnstile_unavailable`.
  - `_shared/turnstile.ts` calls siteverify with the secret, the token and the visitor's IP. It needs `TURNSTILE_SECRET_KEY`; the function refuses to start without it.
- **Embed:**
  - Loads `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` only for forms with a site key, once per page, and renders the widget under the form in German, with `appearance: interaction-only` (visible only when Cloudflare needs the visitor). It is removed when the form completes.
  - Each *Abschließen* sends the widget's current token; after a failed send the widget is reset, so a retry carries a new token (same submission ID).
  - No token yet → "Bitte warten Sie, bis die Sicherheitsprüfung … abgeschlossen ist …", nothing sent. Script blocked or widget error → "Die Sicherheitsprüfung konnte nicht geladen werden …". 403 → "Die Sicherheitsprüfung ist fehlgeschlagen …".
  - Every form has a hidden honeypot input `hfs_check` (off-screen via the CSSOM, `aria-hidden`, `tabindex=-1`, `autocomplete=off`), outside the SurveyJS answers.
- **Docs:** README (new section *Bot protection*, the CSP line for TYPO3 admins, request shape), blueprint §4.2 (request shape, step order) and §9 (`TURNSTILE_SITE_KEY`).
- **Checks:**
  - `npm test` passes, 451 tests. New: the handlers with a fake verifier (submit 14, load 1), siteverify with a fake `fetch` (12), the embed's bot check with a fake Turnstile API (8), the embed clients (4), SQL (4), the audit description (2).
  - `npm run typecheck` and Biome on all changed files pass.
  - Not run: `deno check` (Deno isn't installed), no deploy, no request against real Cloudflare from the functions.
- **Browser check (local, stubbed `fetch`, Cloudflare's always-pass test site key):** `embed.js` from the dev server loaded Cloudflare's script and rendered the widget. The first *Abschließen* sent `turnstile_token` and an empty `honeypot`, got a stubbed 403 and showed the German message. The second, after the reset widget had a new token, used the same submission ID, got 202, showed the completion text, and the widget was gone. The dashboard switch was not checked in the browser (needs a login); it is covered by typecheck and the SQL tests.
- **Review (two axes), fixed:**
  - The switch had its toggle on the left; ui-design §5 wants it right-aligned.
  - The blueprint's request shape lacked `honeypot`.
  - A widget error (say, a hostname the site key does not allow) left the visitor at "please wait" forever. It now shows the unavailable message until the next reset.
  - The honeypot was named `website`, which autofill might fill, silently dropping a real visitor. It is now `hfs_check`, and drops are logged.
  - The message keys for the bot check are now one type (`BotCheckWait`), `bot` became `botCheck`, and the honeypot got a named type.
  - Not changed: "no token" is `""` on the server and `null` in the embed, and `ip === "unknown"` couples the verifier to `clientIp`. Both are small and commented. "Widget" (avoided in GLOSSARY for the embed) is used only for Cloudflare's Turnstile widget.

For the human, in this order:

1. In the Cloudflare dashboard, create a Turnstile widget (mode *Managed*). Add the hostnames of the TYPO3 sites, and `localhost` for testing.
2. Set both keys:

   ```bash
   npx supabase secrets set TURNSTILE_SITE_KEY=<site key> TURNSTILE_SECRET_KEY=<secret key>
   ```

   **Both functions refuse to start without them.** Set them before deploying, or `/load-form` goes down too.
3. `npm run db:push`, then run `supabase/snippets/rls-checklist-teams.sql`. Expect all checks to pass.
4. `npm run functions:deploy -- load-form submit-form`, then `npm run deploy` for the new `embed.js` and the dashboard switch.
5. With a published form (Turnstile is on for every existing form, by default):
   - `curl -i -H "Origin: http://localhost:3000" "https://qhjysorczroizpgmagpp.supabase.co/functions/v1/load-form?form_id=<id>"` should include `turnstile_site_key`.
   - The `/submit-form` curl from ticket 12, without `turnstile_token`: expect 403 `{"error":"turnstile_invalid"}`. With `"turnstile_token":"forged"`: 403 too.
   - The same curl with `"honeypot":"x"` and a fresh `submission_id`: expect 202, and no new row in `form_stats`.
6. In the dashboard, switch *Bot-Schutz* off for the form and save. The audit log should show "Bot-Schutz geändert". The `load-form` curl no longer includes the key, and the submit curl without a token gets 202. Switch it on again.
7. On the TYPO3 test page: if it sends a CSP, add `https://challenges.cloudflare.com` to `script-src` and `frame-src`. Fill in the form: it should send normally, usually without the visitor seeing the widget.

Open points for the reviewer:

- **Fail closed, like the rate limit.** If Cloudflare can't verify, submissions to forms with Turnstile on are refused (503). The owner chose this for Redis in ticket 14; I applied the same here without being asked. Letting them through instead is one `catch` in `checkTurnstile`.
- **The siteverify `hostname` is not checked.** Cloudflare already ties the site key to the widget's hostnames. Checking it against the allowed origins would be a small addition, but Cloudflare's test keys report `example.com`, which would break local testing.
- **Honeypot hits still count against the rate limit** (it runs first), and they get 202, so the visitor-facing "3 per hour" also applies to bots.
- **A Cloudflare script that fails to load is cached for the page.** All forms on that page then show the "could not be loaded" message until the page is reloaded.
- **Turnstile sees the visitor's IP** (we pass `remoteip`), as ADR-0002 allows for bot-check signals. It never sees answers.

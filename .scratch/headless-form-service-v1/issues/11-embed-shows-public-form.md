# 11: `embed.js` shows a public form

**What to build:** An editor pastes a `data-form` div plus the `embed.js` script tag into a TYPO3 HTML field, and the page shows the form's current version. `embed.js` is built from the embed source and served by the dashboard.

**Blocked by:** 10 (`/load-form` endpoint)

**Status:** ready-for-human

- [x] The embed bundles the SurveyJS runner and theme; the build produces one script served at `/embed.js`
- [x] Several embeds on one page work independently
- [x] Loading errors show a German message instead of an empty box
- [ ] Verified on a TYPO3 page; CSP requirements documented for TYPO3 admins (CSP documented; the TYPO3 check needs a human)

## Comments

**2026-10-06, agent:** Repo side done. The first three criteria are met. The CSP requirements are documented, but the check on a real TYPO3 page has to be done by a human.

- **Source in `embed/`:**
  - `main.ts` is the entry point. It finds every `[data-form]` element and gives each its own `fetch`, SurveyJS `Model` and React root.
  - `load.ts` is the `/load-form` client, with `fetch` injected.
  - `messages.ts` holds the German texts.
  - `bundle.mts` runs esbuild: one minified IIFE script with SurveyJS (`survey-core` and `survey-react-ui`, with React), its default theme (CSS bundled as text) and the German locale. `__LOAD_FORM_URL__` is compiled in from `NEXT_PUBLIC_SUPABASE_URL`.
  - `build.mts` writes `public/embed.js`. That file is gitignored.
- **Build:**
  - `npm run build:embed`. `predev` and `prebuild` run it, and `preview` and `deploy` pick it up because OpenNext runs `npm run build`.
  - The scripts run with Node's type stripping, so `engines` now asks for Node 22.18 or later.
  - `public/_headers` caches `/embed.js` for 5 minutes.
  - The auth proxy already skips `.js`, so `/embed.js` is public: 200 without a session, checked with curl.
- **Independent embeds:** each element loads and fails on its own. Copies of the script coordinate through markers on the page: a `data-form-mounted` attribute on each element and a window flag for the styles. A snippet pasted once per form therefore loads each form once.
- **Messages:**
  - While loading: "Formular wird geladen …".
  - Unknown, unpublished or archived form, or an empty `data-form`: "Dieses Formular ist nicht verfügbar."
  - Network error, 5xx, an origin that is not allowed (the browser hides the 403, so it can't be told apart), a malformed answer, more than 15 s, or a render crash: "Das Formular konnte nicht geladen werden. Bitte versuchen Sie es später erneut."
  - 403 `form_pass_invalid`: "Dieser Link ist ungültig oder abgelaufen."
- **CSP:** the theme goes in through a constructed stylesheet (`adoptedStyleSheets`), so `style-src` needs no `'unsafe-inline'`. TYPO3 needs only `script-src <dashboard>` and `connect-src https://qhjysorczroizpgmagpp.supabase.co`. The README section "Embedding forms" documents this for TYPO3 admins, and also the allowed-origin step.
- **Checks:**
  - `npm test` passes, 271 tests, 13 of them new in `embed/`. They cover the load client's outcomes, and that the bundle is one classic script containing the endpoint and theme.
  - `npm run typecheck` and Biome on the changed files pass.
- **Browser check (local, not TYPO3):** a page on `http://localhost:5500` loaded `embed.js` cross-origin from the dev server. Its CSP was `default-src 'none'; script-src 'self' http://localhost:3000; connect-src <supabase>; style-src 'none'`.
  - It had six embeds and the script tag twice.
  - A stubbed `fetch` served two fake schemas, a 500 and a 403 `form_pass_invalid`. One unknown UUID went to the real `/load-form`.
  - Result: both forms rendered styled. The dropdown popup opened, and *Abschließen* was blocked with its notice. Every error box showed the right German text. There were 5 requests, one per form, and no CSP violation.
  - The cloud project has no published form, and I didn't publish one, because versions are immutable. The real 404 path was checked with curl from the allowed origin.
- **Review (two axes), fixed:**
  - The first CSP run caught a bad feature check that fell back to a `<style>` element, which the CSP blocked.
  - Browsers without `AbortSignal.timeout` got only the error message.
  - `root.unmount()` ran inside React's error callback.
  - The bundle API returned a list for one file.
  - `@next/env` was imported without being a dependency.
  - The README and comments said "runner" (GLOSSARY says to avoid it).

For the human, in this order:

1. Deploy the dashboard (`npm run deploy`) and check `https://<dashboard-domain>/embed.js` loads.
2. Add the TYPO3 site's origin to the allowed origins in the SQL editor (README, "Loading forms").
3. Publish a test form in the dashboard and copy its ID.
4. On a TYPO3 test page, put this in an HTML content element twice, with two different forms if possible:

   ```html
   <div data-form="<id>"></div>
   <script src="https://<dashboard-domain>/embed.js" defer></script>
   ```

   Expect both forms, styled, in German. Expect no CSP errors in the browser console. If TYPO3 sends a CSP, it must allow what the README lists.
5. Change one ID to a random UUID: that box shows "Dieses Formular ist nicht verfügbar."
6. Tick the last box here.

Open points for the reviewer:

- **Size:** `embed.js` is about 2.4 MB minified, about 490 KB gzipped. Most of it is SurveyJS's CSS (515 KB) and `survey-core`. Switching to `survey-js-ui` (Preact) would save React's share. That needs a new dependency, so it's not done here.
- ***Abschließen* is blocked** with a notice until ticket 12 sends submissions, so no visitor thinks theirs went through. Ticket 12 removes the `onCompleting` guard and `messages.submitUnavailable`.
- **The "link invalid" text for `form_pass_invalid`** is already in, because `/load-form` returns that for every protected form today (§6). Ticket 26 adds reading `?form_pass=`.
- **The theme is SurveyJS's default,** not a DRK theme. The TYPO3 page's CSS for bare elements can still leak in; isolating that would need Shadow DOM.
- **Only elements present at page load are filled.** Content that TYPO3 adds later with AJAX isn't.
- **Older browsers:** before Safari 16.4, the `<style>` fallback needs `style-src 'unsafe-inline'` when there's a CSP. Before Safari 16, there is no 15 s timeout.

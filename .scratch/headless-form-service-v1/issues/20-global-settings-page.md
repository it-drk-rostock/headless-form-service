# 20: Global settings page

**What to build:** A Super Admin manages global settings in the dashboard: allowed origins and rate limits. Changes take effect without redeploying.

**Blocked by:** 06 (Audit log), 11 (`embed.js` shows a public form), 14 (Rate limiting)

**Status:** ready-for-human

- [x] Settings page visible only to Super Admins
- [x] Allowed origins and both rate limits are editable and validated
- [x] `/load-form` and `/submit-form` pick up changes
- [x] Changes are recorded in the audit log

## Comments

**2026-10-07, agent:** The repo work is done. All four criteria are met and tested. Before it works live, a human has to push the migration (ADR-0006). The edge functions need no redeploy: they already read the row on every request.

- **Database:** migration `20261007160000_settings_page.sql`.
  - Super Admins may read the `settings` row and update `allowed_origins`, `load_rate_limit` and `submit_rate_limit` (column grants plus RLS). Everyone else signed in sees no row; anon still has no privilege. Nobody adds or deletes the row through the Data API.
  - Stricter checks:
    - each origin is `http(s)://` + lower-case host (letters, digits, hyphens, dots) + optional port, no path or trailing slash, no empty entries, at most 100;
    - both limits are 1 to 100 000.
  - Before adding the checks, the migration cleans the hand-edited row: origins lower-cased, trailing slash removed, blanks and duplicates dropped, limits capped at 100 000. An origin with a path or wildcard still makes the migration fail, on purpose (it never matched a browser's origin). I checked this on PGlite with dirty data.
  - Audit: `settings.origins_changed`, `settings.load_limit_changed`, `settings.submit_limit_changed`, each with `from` and `to`, team null, so only Super Admins see them. A save that changes nothing records nothing. German labels: *Erlaubte Websites geändert* (shows `+`/`−` per origin), *Aufruf-Limit geändert* (`60 → 120 pro Minute und IP`), *Einsende-Limit geändert* (`… pro Stunde und IP`).
- **Validation** (`lib/settings/`):
  - `parseAllowedOrigins` takes one origin per line, or comma/semicolon/space separated. It stores each as browsers send it (`URL.origin`: lower case, default port and trailing slash dropped, international domains in punycode), each once, in order. It refuses paths, queries, fragments, credentials, wildcards, IPv6 and other schemes, and names the bad entry.
  - `parseRateLimit` accepts whole numbers from 1 to 100 000.
- **Dashboard:** `/settings`, with a gear icon *Einstellungen* at the bottom of the rail above the avatar (ui-design §4), for Super Admins only. Everyone else gets "not found", and the server action checks again.
  - The page has the intro text, *Speichern* top right (disabled until something changed), *Erlaubte Websites* (textarea, orange note when empty) and the two limits.
  - No *← Zurück zu …* link: it is a top-level module page, like `/audit-log`.
- **"Pick up changes":** this was already true (`readEndpointSettings` reads the row per request, the Redis limiter keeps one limiter per limit value with shared keys). New handler tests lock it in for both functions: a raised limit and a removed origin take effect on the next request. A DB test checks that the service role reads what a Super Admin saved.
- **RLS checklist:** checks 33 (a Team Admin neither sees nor changes the settings) and 34 (a Super Admin changes them and the change is audited), now 34 of 34. Two tests show it catches a leaking policy and a missing audit trigger.
- **README:** new section *Global settings*. The "until ticket 20, use the SQL editor" notes are gone.
- **Checks:**
  - `npm test`: 636 tests. New tests: settings DB (22), origin and limit parsers (27), audit wording (4), navigation (2), handlers (2), checklist (2). One existing load-form DB test changed: signed-in non-Super Admins now get no row instead of a privilege error.
  - **Flaky DB tests:** full parallel runs had 3 to 10 PGlite `beforeEach` timeouts (`Hook timed out in 10000ms`, first test of each DB file). This is the known flake. The DB tests with `--maxWorkers=4` pass in full (218), and the other 418 tests pass.
  - `npm run typecheck`, Biome on the changed files and `next build` pass. Biome on the whole repo still reports the pre-existing errors in `.agents/` and `vitest.config.ts`.
  - **Browser:** I used a temporary unauthenticated route, since deleted, rendering the shell as a Super Admin with the settings form. I checked:
    - the gear at the bottom of the rail;
    - the layout at 1280 px;
    - *Speichern* enabling on an edit and disabling when the value goes back;
    - no console errors.

    I did not check the real page or a real save, which need an account and the migration. Not run: `deno check`.
- **Review (two axes).** Fixed:
  - the migration would have aborted on a hand-edited row (now cleaned first);
  - a missing grant now shows "Nur Super Admins …" instead of the generic error;
  - `parsed` was renamed to `origins`;
  - the duplicated heading was removed, and *Speichern* no longer gets squeezed.

  Left as is (judgement calls):
  - the stored/shown/values state pattern is copied from `FormSettings`;
  - the shell's per-module ternary keeps growing (a per-module map would help once ticket 21 or others add more);
  - the origin rule exists in both SQL and TS, tied by comments as with `MAX_RECIPIENTS`.

For the human, in this order:

1. In the SQL editor, look at the current row: `select allowed_origins, load_rate_limit, submit_rate_limit from public.settings;`. Every origin must be scheme + host (+ port) only. Fix any with a path by hand, or the migration stops.
2. Run `npm run db:push`. Run the query again: same origins (lower case, no trailing slash), same limits.
3. Run `supabase/snippets/rls-checklist-teams.sql`. Expect `RLS checklist passed: 34 of 34 checks`.
4. As Super Admin, click the gear at the bottom of the rail. Check that:
   - *Speichern* stays disabled until you change something.
   - `https://www.drk-rostock.de/kurse` is refused with a message naming it.
   - `0` as a limit is refused.
5. Add an origin such as `HTTPS://Test.Example/`. Change *Aufrufe pro Minute* to 2, and save. You should see *Gespeichert*, and the list should show `https://test.example`.
6. Without redeploying, run the curl from ticket 14 step 4 three times (`Origin: http://localhost:3000`). Expect 200, 200, 429. Set the limit back to 60.
7. Open `/audit-log`. You should see *Erlaubte Websites geändert* (`+ https://test.example`) and two *Aufruf-Limit geändert* entries, team "–", with you as actor. Remove the test origin again.
8. Log in as a Team Admin. There is no gear, and `/settings` is "not found".

Open points for the reviewer:

- **New bounds.** At most 100 origins and limits up to 100 000 are my choice; the spec names no bounds.
- **IPv6 origins are refused.** Embedding from a bare IPv6 address seems unlikely to be needed.
- **No undo or confirmation.** Removing the TYPO3 origin takes every embedded form down at once. The empty-list note warns about the extreme case only. A confirmation when origins are removed could be added.
- **Limit changes and Redis.** A changed limit gets a new limiter on the same keys, so the window's counts carry over (ticket 14). This was not tested against real Redis.
- **Sidebar item *Allgemein*.** It exists so the sidebar isn't empty, and is a natural home for ticket 21's recipient domains.

# 02: Dashboard shell

**What to build:** Opening the dashboard shows a German Mantine app shell (header, navigation, content area) that later pages plug into. All UI text goes through i18n keys with German as the only locale. The dashboard deploys to Cloudflare via OpenNext. Look and feel follow [`docs/ui-design.md`](../../../docs/ui-design.md): icon rail, module sidebar, breadcrumb top bar, Mantine theme with DRK red as primary colour.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [x] Mantine is set up with an app shell and navigation placeholders for Teams and Forms
- [x] The shell and theme match `docs/ui-design.md` (§2 colours, §3 type and shape, §4 layout, §6 theme)
- [x] All visible strings come from German i18n keys
- [ ] A deploy to Cloudflare via OpenNext serves the shell
- [x] Local `npm run dev` works without a session (no crash)

## Comments

**2026-10-04, agent:** Repo side done. Four of the five criteria are met. The Cloudflare deploy still needs a human, because it needs a Cloudflare login.

- **Shell:** Mantine 9 `AppShell` in `app/_shell/`. It has a 56px icon rail with *Formulare* and *Teams*, and German tooltips. The module sidebar is 248px and collapsible, with the org header, *Alle Formulare* and a collapsible *TEAMS* section. Below `md` it becomes a drawer. The top bar is 48px with breadcrumbs. Pages are in `app/(dashboard)/`, and `/` redirects to `/forms`.
- **Theme:** `app/theme.ts` follows ui-design §2.1 and §6. Inter is loaded with `next/font`, and the colour scheme is forced to light.
- **i18n:** every visible string, aria-label and page title comes from `lib/i18n/de.ts` through the typed `t(key)`. `<html lang="de">`. I wrote a small module for this instead of using next-intl, because German is the only locale and the keys are type-checked. Swapping it out later only touches `lib/i18n/`.
- **Deploy:** I set up the `@opennextjs/cloudflare` adapter with `wrangler.jsonc`, `open-next.config.ts` and the scripts `npm run preview` and `npm run deploy`. Locally, `opennextjs-cloudflare build` succeeds on Windows. `wrangler dev` on the built worker returned 307 for `/` → `/forms` and the German pages. `wrangler deploy --dry-run` passes, with 1.09 MiB gzipped.
- **Checks:** `npm test` passes (7 tests), as do `npm run typecheck`, Biome on the changed files and `next build`. `npm run dev` renders without a session and with no console or server errors. I clicked through it at 1280px and at 800px.
- **Review:** I ran a two-axis review. I fixed the drawer opening invisibly on desktop (it caused a scroll lock), the hover colour, the 4px grid, the 13px hint text and a duplicated header height, and I removed unused Wrangler bindings.

For the human:

1. `npx wrangler login`.
2. `npm run deploy` (first stop `npm run dev`; on Windows its Cloudflare dev proxy locks `.open-next/assets`).
3. Open the `*.workers.dev` URL it prints. It should redirect to `/forms` and show the shell. Then tick criterion 4.

Open points for the reviewer:

- The rail has no *Einstellungen*, *Audit-Log* or user avatar with *Abmelden* yet. They depend on roles and login (tickets 03, 06 and 20).
- `org.name` ("DRK Rostock") is an i18n string for now.
- `#E60005` has not been checked against the DRK Rostock brand manual (ui-design §2.1).
- The worker runs on Cloudflare's global network. The dashboard never sees submission answers, so I read ADR-0002 as not applying, but please confirm.
- `package.json` gained an `allowScripts` entry so that npm 12 runs the esbuild and workerd install scripts.

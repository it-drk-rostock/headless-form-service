# 02: Dashboard shell

**What to build:** Opening the dashboard shows a German Mantine app shell (header, navigation, content area) that later pages plug into. All UI text goes through i18n keys with German as the only locale. The dashboard deploys to Cloudflare via OpenNext. Look and feel follow [`docs/ui-design.md`](../../../docs/ui-design.md): icon rail, module sidebar, breadcrumb top bar, Mantine theme with DRK red as primary colour.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Mantine is set up with an app shell and navigation placeholders for Teams and Forms
- [ ] The shell and theme match `docs/ui-design.md` (§2 colours, §3 type and shape, §4 layout, §6 theme)
- [ ] All visible strings come from German i18n keys
- [ ] A deploy to Cloudflare via OpenNext serves the shell
- [ ] Local `npm run dev` works without a session (no crash)

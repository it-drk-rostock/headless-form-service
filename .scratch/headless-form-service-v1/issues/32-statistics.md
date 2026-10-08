# 32: Statistics

**What to build:** A form's page shows how it is doing: submissions over time, sent vs failed, conversion (loads vs submissions) and a breakdown per form version.

**Blocked by:** 13 (Dispatcher sends the notification email)

**Status:** ready-for-human

- [x] Charts by day/hour from `form_stats` and `form_load_counts`
- [x] Sent vs failed ratio
- [x] Submission counts per form version
- [x] Only data of forms owned by the viewer's teams is shown

## Comments

**2026-10-08, agent:** Implementation is done and ready for human review. The parent spec is `docs/technical_blueprint.md` §8 (with §2.1 and §3) and `docs/ui-design.md`. There is no feature-local `spec.md`.

- **Database:** migration `20261008180000_statistics.sql`.
  - Signed-in people may read `form_load_counts` through RLS (the form's team members and Super Admins), as ticket 31 did for `form_stats`. Nobody signed in can write.
  - `public.form_statistics(form, days)` (1 to 366) counts everything in the database and returns JSON: `by` (hour/day), `from`/`to`, a `series` with one entry per hour or day (submissions, sent, failed, loads), `totals` (submissions, queued, sent, failed, loads) and `versions` (submissions per version).
  - `days = 1` means today by hour; the other periods are by day. All times are Berlin time, like the load counts.
  - The function runs as its caller (security invoker), so RLS decides: it returns `null` for a form the person may not see. It is closed to anon and the secret key.
  - A new index covers `form_stats (form_id, submitted_at)`.
- **UI:** the new *Statistik* view (`?view=statistics&period=1|7|30|90`, default 30) sits between *Pässe* and *Fehler*.
  - Period control: *Heute*, *7/30/90 Tage*. It changes the URL and reloads the page's data.
  - Tiles: submissions, loads, conversion (submissions per load) and delivery (sent out of sent plus failed, with both counts).
  - A sent/failed/queued bar. *Fehlgeschlagen* is red with an icon (ui-design §2.3).
  - Bar charts of submissions per hour or day, and of loads per day (hourly loads do not exist). Each has hover tooltips and a hidden table for screen readers.
  - A table of submissions per version with each version's share.
  - An empty state shows when the period has neither loads nor submissions.
- **Code:** `lib/forms/statistics.ts` holds the types, parsing, period, rates and point labels. `getFormStatistics` is in `lib/forms/queries.ts`. `formatPercent` is in `lib/i18n`.
- **RLS checklist:** now 47 checks. New check 47: other teams see neither loads nor statistics, and the form's team sees both. Check 32 also covers `form_statistics` for anon.
- **Changed test:** `load-form.test.ts` used to expect that signed-in people could not read load counts. It now expects that they cannot write them. This ticket deliberately opens reading.
- **Tests:** SQL 11 new (daily and hourly buckets, period boundaries, totals, versions, 90 empty days, visibility, no writes, anon, period range). Domain 11 new, i18n 1 new, checklist guards 4 new.
- **Validation:**
  - `npm test -- --maxWorkers=4` passes: **1005 tests in 66 files**.
  - `npm run typecheck`, Biome on the changed files, `git diff --check` and `npm run build` also pass.
  - I did not open the view in a browser. It needs a sign-in to the shared cloud project, and the migration is not deployed yet.

## Standards

Independent review: three breaches of documented standards, all fixed.
- Fixed: point labels built German text in code (`… Uhr`). They now go through i18n keys (blueprint §1.2).
- Fixed: a percent formatter with a hard-coded `de-DE` sat in the domain module. It is now `formatPercent` in `lib/i18n`, next to `formatDate`.
- Fixed: the failed key had no icon (ui-design §2.3).
- Fixed smells: a duplicated message key, an unused key, the version label borrowed from the failures view, the names `BAR`/`every`/`choose`, and over-long doc comment lines.
- Left: `by === "hour"` branches in the view and `case when by_hour` in SQL (few, local). `StatisticsPoint.at` stays a string in two formats, which keeps the JSON plain.

## Spec

Independent review: all four criteria are implemented. Time zones, DST, period bounds, RLS and the rates were judged correct.
- Fixed: loads were charted nowhere. There is now a loads-per-day chart. With loads but no submissions, the view still shows its charts instead of the empty state.
- Fixed: the failed status icon (as above).
- Left, by design: hours carry no loads, because `form_load_counts` is per day. The hourly view counts today's loads in the tiles only. Conversion and sent vs failed are shown as period totals and in the tooltips, not as their own time series.
- Left: Super Admins see every form's statistics (blueprint §2.1), beyond the ticket's "viewer's teams".
- Left: the page fetches the statistics on every view of `/forms/[id]` (one RPC), so switching tabs needs no reload.
- Scope beyond the ticket, kept: the period selector, the *Unterwegs* (queued) count, and the new index.

Review totals: Standards 3 breaches (fixed), 9 smells (7 fixed); Spec 0 missing, 2 partial (fixed), 3 points left by design.

## Human review handoff

1. **Deploy.**
   - Run `npm run db:push` to apply `20261008180000_statistics.sql`. Do this before deploying the dashboard: `/forms/[id]` calls `form_statistics` and fails without it.
   - Then run `supabase/snippets/rls-checklist-teams.sql` in the SQL editor. Expect *47 of 47*.
   - Then `npm run deploy`. No edge function changed. This agent has not deployed anything.
2. **Make data.** Load an embedded, published form a few times and submit it a few times, if possible across two versions (publish in between). The ticket 30 handoff shows how to make a failure.
3. **Check the view.** Open `/forms/<id>?view=statistics` (*Statistik*).
   - The tiles should show your submissions, today's loads, the conversion and the delivery rate.
   - Hover the bars to see each hour's or day's counts. Check *Heute* (hours, no loads chart) and *7/30/90 Tage* (days, with a loads chart).
   - Compare a few numbers with `select status, version, submitted_at from form_stats where form_id = '<id>';` and `select * from form_load_counts where form_id = '<id>';`.
   - Please also check the layout at 1280 px.
4. **Visibility.** A member of another team should not reach the form, and `select public.form_statistics('<id>', 7);` run as that member gives `null`. A Super Admin sees it.
5. **Stop.** Stop after the ticket 32 review. No later ticket was started.

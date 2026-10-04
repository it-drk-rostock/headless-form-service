This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Backend

There is one cloud Supabase project for development and production ([ADR-0006](docs/adr/0006-single-cloud-environment.md)): every migration and function deploy goes to the live system.

- `supabase/migrations/`: database schema. Apply with `npm run db:push`.
- `supabase/functions/<name>/`: Deno edge functions. Deploy with `npm run functions:deploy` (all) or `npm run functions:deploy -- <name>`.
- `lib/shared/`: code shared by the dashboard, the edge functions and the embed. Web-standard APIs only, imported with explicit `.ts` extensions so Deno can load it.

Link the CLI once per machine:

```bash
npx supabase login
npx supabase link --project-ref qhjysorczroizpgmagpp
```

### Edge function test seam

Each function is a thin `index.ts` that only calls `Deno.serve` and wires real dependencies into a portable `handler.ts`. The handler takes a `Request` plus injected dependencies and returns a `Response`, using Web-standard APIs only, so Vitest tests it in Node with in-memory fakes. See `supabase/functions/ping/` for the pattern.

`npm test` runs every `*.test.ts` under `app/`, `lib/` and `supabase/functions/`. `npm run typecheck` covers everything except the Deno entry points.

## Dashboard

Next.js with Mantine, styled per [`docs/ui-design.md`](docs/ui-design.md). All UI text comes from German i18n keys in `lib/i18n/de.ts`; components call `t("key")` and never inline strings.

- `app/_shell/`: the app shell (icon rail, module sidebar, breadcrumb top bar). Modules are listed in `app/_shell/navigation.ts`.
- `app/(dashboard)/`: pages rendered inside the shell.

```bash
npm run dev
```

### Deploy to Cloudflare

The dashboard runs as a Cloudflare Worker built with OpenNext (`wrangler.jsonc`, `open-next.config.ts`). Log in once per machine with `npx wrangler login`, then:

```bash
npm run deploy
```

`npm run preview` builds the worker and serves it locally through Wrangler. On Windows, stop `npm run dev` first: its Cloudflare dev proxy locks `.open-next/assets` and the build fails with `EBUSY`.

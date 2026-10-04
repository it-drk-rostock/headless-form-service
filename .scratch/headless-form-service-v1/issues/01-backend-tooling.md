# 01: Backend tooling

**What to build:** Developers can write database migrations, edge functions and shared logic in this repo and test them. The Supabase CLI is linked to the single cloud project (ADR-0006), with a migrations folder and a Deno functions folder. Vitest runs from the repo root. A shared module exists for code used by the dashboard, the edge functions and the embed. A sample edge function shows the agreed test seam: a thin Deno entry point around a portable handler that takes a `Request` plus injected dependencies and returns a `Response`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Supabase CLI is configured against the cloud project; migrations and functions deploy from the repo
- [x] Vitest runs with one npm script and finds tests in the shared module and in edge function handlers
- [x] The sample handler uses only Web-standard APIs and is tested with in-memory fakes, no network
- [x] The sample function deploys and answers from the cloud project
- [x] Biome lint passes on the new code

## Comments

**2026-10-04, agent (commits 805977d, efa32d7):** Repo side done. `npm test` runs Vitest over `lib/**` and `supabase/functions/**` (4 passing). `npm run typecheck`, Biome on the new files, and `next build` all pass. `deno check` passes on `supabase/functions/ping/index.ts`, and running it locally under Deno answered 200 JSON to GET and 405 with `Allow: GET` to POST. Criteria 1 and 4 still need a human, because they need cloud credentials:

1. `npx supabase login`, then `npx supabase link --project-ref <ref>`. Record the ref in the README.
2. `npm run functions:deploy -- ping` (uses `--use-api`). This is the first real test that the `../../../lib/shared/http.ts` import outside `supabase/` gets bundled. If it fails, revisit where `lib/shared/` lives.
3. `curl https://<ref>.supabase.co/functions/v1/ping` should return 200 with `{"status":"ok","time":...}`. `ping` has `verify_jwt = false`, so no key is needed.
4. Optionally run `npm run db:push` to confirm the migrations path works. With no migrations yet it should be a no-op.

Open points: the pre-existing scaffold (`biome.json`, `.gitignore`, `next.config.ts`, `app/`, docs, `.scratch/`, `.agents/`, `.claude/`) is still untracked, so a fresh clone can't reproduce lint or build. `npm run lint` fails only on the vendored `.agents/skills/setup-ts-deep-modules/dependency-cruiser.config.cjs`. Whether `ping` should stay public afterwards (ADR-0004 public-surface wording) is a decision for the reviewer.

**2026-10-04, human:** Linked the CLI to `qhjysorczroizpgmagpp`, deployed `ping` and got a 200 from the cloud project. The import from `lib/shared/` bundled fine with `--use-api`. Criteria 1 and 4 are confirmed. The project ref is now in the README.

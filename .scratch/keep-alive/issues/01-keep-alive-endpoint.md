# 01 - Keep-alive edge function and database heartbeat

Status: resolved

## Requirements

1. **Migration (`20261013080000_keep_alive.sql`):**
   - Create `private.keep_alive` table:
     - `id integer primary key default 1 check (id = 1)` (strictly 1 row)
     - `last_seen_at timestamptz not null default now()`
     - `source text not null default 'cron'`
     - `count bigint not null default 1`
   - Enable RLS, revoke direct access from all roles.
   - Function `public.touch_keep_alive(source_name text)`:
     - Upserts the row, increments `count`, updates `last_seen_at`.
     - Callable only by `service_role`.
2. **Edge Function (`supabase/functions/keep-alive/`):**
   - `handler.ts`:
     - Accepts GET and POST.
     - Checks `Authorization: Bearer <KEEPALIVE_KEY>` if `KEEPALIVE_KEY` is configured.
     - Rate limits caller IP (e.g., 60/hour via Upstash Redis).
     - Invokes `touch_keep_alive()`.
     - Pings QStash if client is configured.
     - Returns JSON status with timestamp and services status.
   - `handler.test.ts`: Vitest test suite for `handler.ts`.
   - `index.ts`: Deno entry point wiring Supabase service client, Redis rate limiter, QStash client.
3. **Supabase Config:**
   - Add `[functions.keep-alive]` with `verify_jwt = false` in `supabase/config.toml`.
4. **Database Tests:**
   - `supabase/tests/keep-alive.test.ts` verifying permissions and upsert behavior.

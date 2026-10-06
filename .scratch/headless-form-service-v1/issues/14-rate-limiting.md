# 14: Rate limiting

**What to build:** Visitors who hammer the endpoints are slowed down: Redis sliding-window limits per IP on `/load-form` and `/submit-form` (defaults 60/min and 10/min, read from settings). Redis is used for nothing else.

**Blocked by:** 12 (Submission is queued encrypted)

**Status:** ready-for-human

- [x] Exceeding a limit returns 429; the embed shows a German 'too many attempts' message
- [x] Limits are read from the `settings` row
- [x] Handler tests with a fake rate limiter

## Comments

**2026-10-06, agent:** Repo side done. All three criteria are met and tested. A human still has to push the migration, set two secrets and deploy both functions (ADR-0006).

- **Database:** migration `supabase/migrations/20261006200000_rate_limits.sql` adds `settings.load_rate_limit` (default 60) and `settings.submit_rate_limit` (default 10), in requests per minute and IP. Both must be at least 1. Until ticket 20, they are changed in the SQL editor.
- **Rate limit:** `supabase/functions/_shared/rate-limit.ts` is web-standard and tested.
  - `admitPublicRequest` runs the CORS check first, then the rate limit (§4.1 step 2, §4.2 step 1). Preflights and refused origins aren't counted.
  - Over the limit, the answer is 429 `rate_limited`, with CORS headers so the embed can read it.
  - The IP is the first address in `x-forwarded-for`. Requests without one share a single bucket (`unknown`).
  - If the limiter fails, the request is let through, and the error is logged. This is now noted in blueprint §4.1.
- **Redis:** `supabase/functions/_shared/redis.ts` (Deno only) uses `@upstash/ratelimit` 2.2.0 and `@upstash/redis` 1.39.0.
  - A sliding window of 1 minute, with the key prefixes `ratelimit:load-form` and `ratelimit:submit-form`, so loads and submissions count separately.
  - A 1 s timeout, after which the request is let through.
  - There is one limiter per limit value seen. They share the keys, so the window's counts survive a change of the limit.
  - Redis is used for nothing else.
- **Settings:** `readAllowedOrigins` became `readEndpointSettings(supabase, "load" | "submit")`. It reads each function's origins and its own limit in one query, on every request. Each handler now gets `settings` and `withinRateLimit` injected.
- **Embed:** a 429 becomes the reason `rate_limited`.
  - On load: "Zu viele Versuche. Bitte warten Sie einen Moment und laden Sie die Seite dann neu."
  - On submit: "… und versuchen Sie es dann erneut." The form stays open, and the next *Abschließen* sends again with the same submission ID.
- **Checks:**
  - `npm test` passes, 406 tests. New: the rate limit seam (5), the handlers with a fake rate limiter (4 each), the embed clients (1 each), SQL (4).
  - `npm run typecheck` passes. Biome is clean on all changed files.
  - Not run: `deno check` (Deno isn't installed). No deploy and no request against real Redis.
- **Browser check (local, stubbed `fetch`):** `embed.js` from the dev server showed the load message on a 429 from `/load-form`. With `/load-form` succeeding and `/submit-form` answering 429, it showed the submit message inside the form, and the form stayed open.
- **Review (two axes), fixed:**
  - The CORS-plus-limit block was duplicated in both handlers. It is now `admitPublicRequest`.
  - The settings type is now named (`PublicEndpointSettings`).
  - The settings mapping was copy-pasted in both `index.ts` files. It now lives in `readEndpointSettings`.
  - The 60/10 fallbacks repeated the migration's defaults. They are gone.

For the human, in this order:

1. `npm run db:push`. Then `select load_rate_limit, submit_rate_limit from settings;` should give 60 and 10.
2. In the Upstash console, create a Redis database in an EU region (ADR-0002), then set its REST credentials:

   ```bash
   npx supabase secrets set UPSTASH_REDIS_REST_URL=<REST URL> UPSTASH_REDIS_REST_TOKEN=<REST token>
   ```

   **Both functions refuse to start without these secrets.** Set them before deploying, or `/load-form` goes down too.
3. `npm run functions:deploy -- load-form submit-form`.
4. Temporarily set the load limit to 2: `update public.settings set load_rate_limit = 2;`. Then send the same request three times:

   ```bash
   curl -i -H "Origin: http://localhost:3000" "https://qhjysorczroizpgmagpp.supabase.co/functions/v1/load-form?form_id=<published form id>"
   ```

   Expect 200, 200, then 429 `{"error":"rate_limited"}` with `access-control-allow-origin`.
5. **Spoofing check (important).** While still limited, send the same request with `-H "X-Forwarded-For: 198.51.100.$RANDOM"`.
   - It must still get 429. That confirms Supabase's edge overwrites the header, as the code assumes.
   - If it gets 200, a visitor can dodge the limit by faking the header, and `clientIp` must take a different address.
6. After a minute, the request gets 200 again. Set the limit back: `update public.settings set load_rate_limit = 60;`.

Open points for the reviewer:

- **Fail-open:** if Redis is down or slow (over 1 s), nothing is limited. Missing secrets, however, stop the functions at boot, like the other secrets do. I chose availability over strictness; it's one `catch` in `rateLimited` and the timeout in `redis.ts`.
- **IP addresses are stored in Redis** (EU) as key names, for the window of about a minute. Hashing them would be a small change if wanted.
- **One bucket for requests without an address.** If the header were ever missing, all such visitors would share one limit.
- **The limit can't be turned off.** It has to be at least 1. A very high number has the same effect.
- **No GLOSSARY entry** for "rate limit". It's a technical term, not domain language.

**2026-10-06, agent (follow-up, at the owner's request):** two decisions above changed. Where this comment and the one above disagree, this one wins.

- **The limit always applies (fail closed).**
  - If Redis fails, or doesn't answer within 2 s, both functions refuse the request with 503 `rate_limit_unavailable`, and the embed shows its general error.
  - The SDK's timeout would let the request through (`reason: "timeout"`). `redis.ts` turns that into a failure, so it is refused too.
  - A Redis outage therefore takes the forms down. That is intended.
- **Submissions: 3 per hour and IP.**
  - `submit_rate_limit` now defaults to 3, and its window is 1 hour. Loads stay at 60 per minute. The ticket's "10/min" is superseded.
  - The windows are fixed in the handlers (`RATE_LIMIT_WINDOW`); only the numbers live in `settings`. The migration was changed in place, since it hasn't been pushed yet.
  - Every request to `/submit-form` counts, including a retry of the same submission after a 503 or a network error.
- **Embed on submit:** "Zu viele Einsendungen. Bitte versuchen Sie es später erneut."
- **Docs:** blueprint §3 and §4.1, and the README, are updated.
- **Checks:** `npm test` passes, 406 tests (the fail-open tests became fail-closed ones). Typecheck and Biome on the changed files pass.

The steps for the human above still apply, with these changes:

- After step 1, `select load_rate_limit, submit_rate_limit from settings;` should give 60 and **3**.
- **Additional check:** with a published form, send `/submit-form` four times from the same IP, each time with a fresh `submission_id`. Expect 202 three times, then 429. It stays 429 for an hour, unless you raise `submit_rate_limit` meanwhile.

Open points for the reviewer:

- **Shared IPs.** Visitors behind one IP (an office network, mobile carrier NAT) share the 3 per hour. If, say, several colleagues in one DRK office use the same form, the fourth is refused.
- **Retries count.** A visitor whose sending fails twice has one attempt left that hour. If that's too strict, only accepted submissions could be counted. That would mean checking the limit after queueing, a larger change.

# Keep-Alive Endpoint for Supabase & Cloud Infrastructure

Status: ready-for-agent

## Overview

Supabase projects on the Free tier pause after 7 days of inactivity. An external cron scheduler (such as cron-job.org) needs a dedicated HTTP endpoint to regularly perform a real database transaction.

To ensure the entire infrastructure remains healthy and responsive:
1. **Database:** Updates a dedicated single-row table (`private.keep_alive`) via `public.touch_keep_alive()`, ensuring real transactional write compute in Postgres without disk bloat.
2. **Upstash Redis:** Applies a sliding-window rate limit to protect the endpoint from abuse and exercise Redis.
3. **Upstash QStash:** Optionally dispatches a lightweight GET message to `/functions/v1/ping` without retries, keeping QStash queues active.
4. **Authentication:** Protects the endpoint with an optional `KEEPALIVE_KEY` Bearer token to prevent unauthorized triggers.

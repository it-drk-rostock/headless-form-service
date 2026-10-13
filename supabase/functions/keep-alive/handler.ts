// `/keep-alive`: Invoked periodically by cron-job.org or QStash cron to keep
// the free Supabase database from pausing and exercise Upstash Redis & QStash.
import { noStoreJsonResponse as reply } from "../../../lib/shared/http.ts";
import type { RateLimit, RateLimiter } from "../_shared/rate-limit.ts";
import { rateLimited } from "../_shared/rate-limit.ts";

export type KeepAliveDbResult = {
  status: string;
  last_seen_at: string;
  source: string;
  count: number;
};

export type KeepAliveDeps = {
  now: () => Date;
  /** Secret Bearer token. When set, requests must include `Authorization: Bearer <key>`. */
  authKey?: string;
  /** Sliding window rate limiter in Upstash Redis. */
  withinRateLimit: RateLimiter;
  /** Custom rate limit; defaults to 60 requests per hour. */
  rateLimit?: RateLimit;
  /** Performs the database heartbeat write. */
  touchDb: (source: string) => Promise<KeepAliveDbResult>;
  /** Optional ping to Upstash QStash. */
  pingQStash?: () => Promise<{ messageId?: string } | void>;
};

const DEFAULT_RATE_LIMIT: RateLimit = { requests: 60, window: "1 h" };

export async function handleKeepAlive(
  request: Request,
  deps: KeepAliveDeps,
): Promise<Response> {
  try {
    if (request.method !== "GET" && request.method !== "POST") {
      return reply({ error: "method_not_allowed" }, 405, {
        allow: "GET, POST",
      });
    }

    if (deps.authKey) {
      if (!(await isBearerKey(request, deps.authKey))) {
        return reply({ error: "unauthorized" }, 401, {
          "www-authenticate": "Bearer",
        });
      }
    }

    const limited = await rateLimited(
      request,
      deps.withinRateLimit,
      deps.rateLimit ?? DEFAULT_RATE_LIMIT,
    );
    if (limited !== null) {
      return limited;
    }

    const dbResult = await deps.touchDb("cron");

    let qstashStatus: "ok" | "skipped" | "failed" = "skipped";
    if (deps.pingQStash) {
      try {
        await deps.pingQStash();
        qstashStatus = "ok";
      } catch (err) {
        console.error("keep-alive: QStash ping failed", err);
        qstashStatus = "failed";
      }
    }

    return reply({
      status: "ok",
      time: deps.now().toISOString(),
      database: dbResult,
      services: {
        database: "ok",
        redis: "ok",
        qstash: qstashStatus,
      },
    });
  } catch (error) {
    console.error("keep-alive failed", error);
    return reply({ error: "internal_error" }, 500);
  }
}

async function isBearerKey(request: Request, key: string): Promise<boolean> {
  const authHeader = (request.headers.get("authorization") ?? "").trim();
  const customHeader = (request.headers.get("x-keepalive-key") ?? "").trim();
  const rawGiven = customHeader || authHeader;
  if (!rawGiven || !key) return false;

  const givenToken = rawGiven.toLowerCase().startsWith("bearer ")
    ? rawGiven.slice(7).trim()
    : rawGiven;

  const expectedKey = key.trim();
  const [given, expected] = await Promise.all([
    sha256(givenToken),
    sha256(expectedKey),
  ]);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= given[i] ^ expected[i];
  }
  return difference === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

// Rate limiting for the public edge functions (blueprint §4.1, §4.2): each
// IP gets a number of requests per window, the number from the `settings`
// row. The limiter itself (Redis) is injected; this part stays web-standard,
// like the handlers.
import { noStoreJsonResponse as reply } from "../../../lib/shared/http.ts";
import { handleCors, withCorsHeaders } from "./cors.ts";

/**
 * What a public edge function reads of the `settings` row on every request,
 * so changes apply at once: the allowed origins and its own limit (requests
 * per window and IP).
 */
export type PublicEndpointSettings = {
  allowedOrigins: string[];
  rateLimit: number;
};

/** At most `requests` per IP within the last `window` (sliding window). */
export type RateLimit = { requests: number; window: "1 m" | "1 h" };

/**
 * Counts one request from `ip`. False once that IP is over `limit`. Throws
 * when it cannot tell, also when Redis is too slow to answer.
 */
export type RateLimiter = (ip: string, limit: RateLimit) => Promise<boolean>;

/**
 * The CORS check, then the rate limit (blueprint §4.1, §4.2). Lets the
 * request through with its `origin`; otherwise returns the `response` to
 * send instead. Preflights and refused origins are not counted.
 */
export async function admitPublicRequest(
  request: Request,
  endpoint: {
    settings: PublicEndpointSettings;
    window: RateLimit["window"];
    withinRateLimit: RateLimiter;
    methods: readonly string[];
  },
): Promise<{ origin: string } | { response: Response }> {
  const { settings, window, withinRateLimit, methods } = endpoint;
  const cors = handleCors(request, settings.allowedOrigins, methods);
  if ("response" in cors) return cors;

  const limited = await rateLimited(request, withinRateLimit, {
    requests: settings.rateLimit,
    window,
  });
  return limited === null
    ? cors
    : { response: withCorsHeaders(limited, cors.origin) };
}

/**
 * The visitor's IP. Supabase's edge overwrites `x-forwarded-for`, so its first
 * address is the caller's. Requests without one share a single bucket.
 */
export function clientIp(request: Request): string {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}

/**
 * 429 when the request's IP is over `limit`, otherwise null. A failing
 * limiter refuses the request with 503: the limit always applies, so an
 * outage cannot be used to flood the forms.
 */
export async function rateLimited(
  request: Request,
  withinRateLimit: RateLimiter,
  limit: RateLimit,
): Promise<Response | null> {
  let within: boolean;
  try {
    within = await withinRateLimit(clientIp(request), limit);
  } catch (error) {
    console.error("rate limiting failed, refusing the request", error);
    return reply({ error: "rate_limit_unavailable" }, 503);
  }
  return within ? null : reply({ error: "rate_limited" }, 429);
}

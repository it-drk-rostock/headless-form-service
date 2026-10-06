// Rate limiting for the public edge functions (blueprint §4.1, §4.2): each
// IP gets a number of requests per minute, from the `settings` row. The
// limiter itself (Redis) is injected; this part stays web-standard, like the
// handlers.
import { noStoreJsonResponse as reply } from "../../../lib/shared/http.ts";
import { handleCors, withCorsHeaders } from "./cors.ts";

/**
 * What a public edge function reads of the `settings` row on every request,
 * so changes apply at once: the allowed origins and its own limit (requests
 * per minute and IP).
 */
export type PublicEndpointSettings = {
  allowedOrigins: string[];
  rateLimit: number;
};

/**
 * Counts one request from `ip`. False once that IP made more than
 * `perMinute` requests in the last minute (sliding window).
 */
export type RateLimiter = (ip: string, perMinute: number) => Promise<boolean>;

/**
 * The CORS check, then the rate limit (blueprint §4.1, §4.2). Lets the
 * request through with its `origin`; otherwise returns the `response` to
 * send instead. Preflights and refused origins are not counted.
 */
export async function admitPublicRequest(
  request: Request,
  settings: PublicEndpointSettings,
  withinRateLimit: RateLimiter,
  methods: readonly string[],
): Promise<{ origin: string } | { response: Response }> {
  const cors = handleCors(request, settings.allowedOrigins, methods);
  if ("response" in cors) return cors;

  const limited = await rateLimited(
    request,
    withinRateLimit,
    settings.rateLimit,
  );
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
 * 429 when the request's IP is over `perMinute`, otherwise null. A failing
 * limiter lets the request through: Redis being down must not keep forms
 * from visitors.
 */
export async function rateLimited(
  request: Request,
  withinRateLimit: RateLimiter,
  perMinute: number,
): Promise<Response | null> {
  try {
    if (await withinRateLimit(clientIp(request), perMinute)) return null;
  } catch (error) {
    console.error("rate limiting failed, letting the request through", error);
    return null;
  }
  return reply({ error: "rate_limited" }, 429);
}

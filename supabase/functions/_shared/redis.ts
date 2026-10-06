// Deno-only wiring of the rate limiter (blueprint §4.1, §4.2): a sliding
// window per IP in Upstash Redis (EU, ADR-0002). Redis is used for nothing
// else. Handlers never import this; they get the `RateLimiter` injected.
import { Ratelimit } from "npm:@upstash/ratelimit@2.2.0";
import { Redis } from "npm:@upstash/redis@1.39.0";
import type { RateLimiter } from "./rate-limit.ts";

/**
 * A limiter whose keys are kept apart per function, so loads and submissions
 * count separately. Throws at boot when the Redis secrets are missing.
 */
export function createRateLimiter(name: string): RateLimiter {
  // Set with `supabase secrets set` (README, "Rate limiting").
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) {
    throw new Error(
      `${name} needs the secrets UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.`,
    );
  }
  const redis = new Redis({ url, token });

  // The limit comes from the settings row on every request, so there is one
  // limiter per value seen. They share the keys: the window's counts stay
  // when the limit changes.
  const limiters = new Map<string, Ratelimit>();
  return async (ip, { requests, window }) => {
    const key = `${requests}/${window}`;
    let limiter = limiters.get(key);
    if (limiter === undefined) {
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(requests, window),
        prefix: `ratelimit:${name}`,
        // The visitor waits on this.
        timeout: 2000,
      });
      limiters.set(key, limiter);
    }
    const { success, reason } = await limiter.limit(ip);
    // On a timeout the SDK lets the request through; the limit must always
    // apply, so it is refused like any other failure (`rateLimited`).
    if (reason === "timeout") {
      throw new Error(`${name}: Redis did not answer the rate limit in time`);
    }
    return success;
  };
}

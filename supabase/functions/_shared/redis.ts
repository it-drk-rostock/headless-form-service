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
  const limiters = new Map<number, Ratelimit>();
  return async (ip, perMinute) => {
    let limiter = limiters.get(perMinute);
    if (limiter === undefined) {
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(perMinute, "1 m"),
        prefix: `ratelimit:${name}`,
        // The visitor waits on this. When Redis is slower, the request is let
        // through, as when it fails (`rateLimited`).
        timeout: 1000,
      });
      limiters.set(perMinute, limiter);
    }
    const { success } = await limiter.limit(ip);
    return success;
  };
}

/**
 * Same bounds as the `settings_*_rate_limit_check` constraints in the
 * database. A limit cannot be turned off; a very high one has that effect.
 */
export const MIN_RATE_LIMIT = 1;
export const MAX_RATE_LIMIT = 100_000;

/** A rate limit as typed: a whole number of requests within the bounds, or null. */
export function parseRateLimit(input: string): number | null {
  const trimmed = input.trim();
  if (!/^[0-9]{1,6}$/.test(trimmed)) return null;
  const limit = Number(trimmed);
  return limit >= MIN_RATE_LIMIT && limit <= MAX_RATE_LIMIT ? limit : null;
}

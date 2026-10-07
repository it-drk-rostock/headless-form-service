import type { MessageKey } from "../i18n/index.ts";

/** Same limit as the `settings_allowed_origins_check` constraint in the database. */
export const MAX_ALLOWED_ORIGINS = 100;

/** The origins the database accepts: a lower-case host name or IPv4 address, optional port. */
const ORIGIN = /^https?:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*(:[0-9]{1,5})?$/;

export type ParsedOrigins =
  | { origins: string[] }
  | { error: MessageKey; origin?: string };

/**
 * The allowed origins as typed: one per line, or separated by commas,
 * semicolons or spaces. Each is written as browsers send it in the `Origin`
 * header (lower case, default port and trailing slash dropped, international
 * domains in ASCII), since `/load-form` and `/submit-form` compare exactly.
 * Kept once each, in order.
 */
export function parseAllowedOrigins(input: string): ParsedOrigins {
  const origins: string[] = [];
  for (const entry of input.split(/[\s,;]+/).filter((e) => e !== "")) {
    const origin = toOrigin(entry);
    if (origin === null) {
      return { error: "settings.errorOriginInvalid", origin: entry };
    }
    if (!origins.includes(origin)) origins.push(origin);
  }
  if (origins.length > MAX_ALLOWED_ORIGINS) {
    return { error: "settings.errorTooManyOrigins" };
  }
  return { origins };
}

/** A website address with nothing but scheme, host and port, as an origin. */
function toOrigin(entry: string): string | null {
  let url: URL;
  try {
    url = new URL(entry);
  } catch {
    return null;
  }
  const bare =
    url.username === "" &&
    url.password === "" &&
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "";
  return bare && ORIGIN.test(url.origin) ? url.origin : null;
}

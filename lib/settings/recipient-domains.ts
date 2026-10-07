import type { MessageKey } from "../i18n/index.ts";

/** Same limit as the `settings_allowed_recipient_domains_check` constraint in the database. */
export const MAX_RECIPIENT_DOMAINS = 100;

/** The longest domain name DNS allows. */
const MAX_DOMAIN_LENGTH = 253;

/**
 * The domains the database accepts: lower-case labels of letters, digits and
 * hyphens, at most 63 characters each, at least two of them.
 */
const DOMAIN = /^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;

export type ParsedRecipientDomains =
  | { domains: string[] }
  | { error: MessageKey; domain?: string };

/**
 * The allowed recipient domains as typed: one per line, or separated by
 * commas, semicolons or spaces. A leading `@` is dropped, so `@drk-rostock.de`
 * works too. Stored in lower case, each once, in order. Only the exact domain
 * is allowed; a subdomain needs its own entry.
 */
export function parseRecipientDomains(input: string): ParsedRecipientDomains {
  const domains: string[] = [];
  for (const entry of input.split(/[\s,;]+/).filter((e) => e !== "")) {
    const domain = entry.replace(/^@/, "").toLowerCase();
    if (domain.length > MAX_DOMAIN_LENGTH || !DOMAIN.test(domain)) {
      return { error: "settings.errorRecipientDomainInvalid", domain: entry };
    }
    if (!domains.includes(domain)) domains.push(domain);
  }
  if (domains.length > MAX_RECIPIENT_DOMAINS) {
    return { error: "settings.errorTooManyRecipientDomains" };
  }
  return { domains };
}

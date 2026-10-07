// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.

/** The domain of an address: everything after the `@`, in lower case. */
export function recipientDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).toLowerCase();
}

/**
 * Whether `address` belongs to one of the allowed recipient domains
 * (GLOSSARY). The domain must be listed exactly: a subdomain is its own
 * entry. `private.check_recipient_domains()` in the database applies the
 * same rule to stored recipients, which are lower case with a single `@`.
 */
export function isAllowedRecipient(
  address: string,
  allowedDomains: readonly string[],
): boolean {
  const domain = recipientDomain(address);
  return domain !== "" && allowedDomains.includes(domain);
}

/** The recipients split into those on an allowed domain and the rest. */
export function splitByAllowedDomain(
  recipients: readonly string[],
  allowedDomains: readonly string[],
): { allowed: string[]; refused: string[] } {
  const allowed: string[] = [];
  const refused: string[] = [];
  for (const address of recipients) {
    (isAllowedRecipient(address, allowedDomains) ? allowed : refused).push(
      address,
    );
  }
  return { allowed, refused };
}

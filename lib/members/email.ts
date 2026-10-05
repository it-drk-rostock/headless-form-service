import type { MessageKey } from "../i18n/index.ts";

/** The longest address SMTP allows (RFC 5321). */
const MAX_EMAIL_LENGTH = 254;

// One `@`, no spaces, and a dot in the domain. Supabase Auth checks the rest.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form Supabase Auth stores addresses in, so lookups by email match. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Why `email` (already normalised) cannot be invited, or null if it can. */
export function emailProblem(email: string): MessageKey | null {
  if (!email) return "members.errorEmailMissing";
  if (email.length > MAX_EMAIL_LENGTH || !EMAIL.test(email)) {
    return "members.errorEmailInvalid";
  }
  return null;
}

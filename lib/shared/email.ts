// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.

/** The longest address SMTP allows (RFC 5321). */
const MAX_EMAIL_LENGTH = 254;

// One `@`, no spaces, and a dot in the domain. Same rule as the
// `public.email_address` domain in the database.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The form Supabase Auth stores addresses in, so lookups by email match. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Whether `email` (already normalised) looks like a deliverable address. */
export function isEmailAddress(email: string): boolean {
  return email.length <= MAX_EMAIL_LENGTH && EMAIL.test(email);
}

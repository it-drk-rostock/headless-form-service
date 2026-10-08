// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.

import { isObject } from "./object.ts";

/** The page URL parameter that carries a form pass's secret (blueprint §6). */
export const FORM_PASS_PARAM = "form_pass";

/** Same limits as `private.is_pass_metadata()` in the database. */
export const PASS_METADATA_MAX_ENTRIES = 20;
export const PASS_METADATA_VALUE_MAX_LENGTH = 500;
export const PASS_METADATA_KEY_MAX_LENGTH = 50;
/** Keys a `{{pass.<key>}}` placeholder can name. */
const PASS_METADATA_KEY = /^[A-Za-z0-9_-]{1,50}$/;

/** Whether `key` can be a pass metadata key, and so be named by `{{pass.<key>}}`. */
export function isPassMetadataKey(key: string): boolean {
  return PASS_METADATA_KEY.test(key);
}

/** Pass metadata (GLOSSARY): flat string or number values, never personal data. */
export type PassMetadata = Record<string, string | number>;

/** A new form pass secret: 256 random bits, base64url without padding. */
export function generateFormPassSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/**
 * What the database keeps of a secret: its SHA-256, lower-case hex. Passes
 * are looked up by this hash.
 */
export async function hashFormPassSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** The form pass link: the form page with the secret as `?form_pass=`. */
export function formPassUrl(formPage: string, secret: string): string {
  const url = new URL(formPage);
  url.searchParams.set(FORM_PASS_PARAM, secret);
  return url.href;
}

export type PassMetadataProblem =
  | "not_object"
  | "too_many"
  | "key_invalid"
  | "value_invalid"
  | "value_too_long";

/** Why `value` cannot be pass metadata, or null if it can. */
export function passMetadataProblem(
  value: unknown,
): PassMetadataProblem | null {
  if (!isObject(value)) return "not_object";
  const entries = Object.entries(value);
  if (entries.length > PASS_METADATA_MAX_ENTRIES) return "too_many";
  for (const [key, entry] of entries) {
    if (!isPassMetadataKey(key)) return "key_invalid";
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) return "value_invalid";
    } else if (typeof entry === "string") {
      if (entry.length > PASS_METADATA_VALUE_MAX_LENGTH) {
        return "value_too_long";
      }
    } else {
      return "value_invalid";
    }
  }
  return null;
}

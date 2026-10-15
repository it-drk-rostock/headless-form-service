"use server";

import { refresh } from "next/cache";
import { requireProfile } from "../auth/profile.ts";
import type { MessageKey } from "../i18n/index.ts";
import { isObject } from "../shared/object.ts";
import { createClient } from "../supabase/server.ts";
import { parseAllowedOrigins } from "./origins.ts";
import { parseRateLimit } from "./rate-limits.ts";
import { parseRecipientDomains } from "./recipient-domains.ts";

/**
 * `origin` and `domain` fill the `{origin}` and `{domain}` placeholders of
 * the message. `savedAt`
 * changes on every successful save, so the form can say so.
 */
export type SettingsActionState = {
  error: MessageKey | null;
  origin?: string;
  domain?: string;
  savedAt?: number;
};

// The database refuses with "insufficient_privilege" when a grant is missing.
const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * Saves the allowed origins, the allowed recipient domains and both rate
 * limits. `/load-form`, `/submit-form` and `/dispatch-email` read them on
 * every request, and the database checks recipients against the domains
 * whenever a form's list changes, so they apply at once. The
 * database records each change in the audit log, in the same transaction.
 */
export async function updateSettings(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const origins = parseAllowedOrigins(
    String(formData.get("allowedOrigins") ?? ""),
  );
  if ("error" in origins) return origins;
  const recipientDomains = parseRecipientDomains(
    String(formData.get("allowedRecipientDomains") ?? ""),
  );
  if ("error" in recipientDomains) return recipientDomains;
  const loadRateLimit = parseRateLimit(
    String(formData.get("loadRateLimit") ?? ""),
  );
  if (loadRateLimit === null) {
    return { error: "settings.errorLoadRateLimitInvalid" };
  }
  const submitRateLimit = parseRateLimit(
    String(formData.get("submitRateLimit") ?? ""),
  );
  if (submitRateLimit === null) {
    return { error: "settings.errorSubmitRateLimitInvalid" };
  }

  const profile = await requireProfile();
  if (!profile.isSuperAdmin) return { error: "settings.errorForbidden" };
  let globalTheme: unknown = null;
  const themeInput = String(formData.get("globalTheme") ?? "").trim();
  if (themeInput) {
    try {
      globalTheme = JSON.parse(themeInput);
    } catch {
      return { error: "settings.errorThemeJson" };
    }
    if (!isObject(globalTheme)) return { error: "settings.errorThemeInvalid" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .update({
      allowed_origins: origins.origins,
      allowed_recipient_domains: recipientDomains.domains,
      load_rate_limit: loadRateLimit,
      submit_rate_limit: submitRateLimit,
      global_theme: globalTheme,
    })
    .eq("id", true)
    .select("id");
  if (error?.code === INSUFFICIENT_PRIVILEGE) {
    return { error: "settings.errorForbidden" };
  }
  if (
    error?.code === "23514" &&
    error.message.includes("settings_global_theme_check")
  ) {
    return { error: "settings.errorThemeInvalid" };
  }
  if (error) {
    console.error("Settings could not be saved", error);
    return { error: "settings.errorGeneric" };
  }
  // RLS hides the row from anyone who is no longer a Super Admin.
  if (data.length === 0) return { error: "settings.errorForbidden" };

  refresh();
  return { error: null, savedAt: Date.now() };
}

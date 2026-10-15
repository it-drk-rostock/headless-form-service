import "server-only";
import { createClient } from "../supabase/server.ts";
import type { GlobalSettings } from "./types.ts";

/**
 * The global settings, or null for anyone but a Super Admin: RLS hides the
 * row from everyone else.
 */
export async function getSettings(): Promise<GlobalSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settings")
    .select(
      "allowed_origins, allowed_recipient_domains, load_rate_limit, submit_rate_limit, global_theme",
    )
    .maybeSingle<{
      allowed_origins: string[];
      allowed_recipient_domains: string[];
      load_rate_limit: number;
      submit_rate_limit: number;
      global_theme: import("survey-core").ITheme | null;
    }>();
  if (error) throw new Error(`Settings could not be loaded: ${error.message}`);
  return data === null
    ? null
    : {
        allowedOrigins: data.allowed_origins,
        allowedRecipientDomains: data.allowed_recipient_domains,
        loadRateLimit: data.load_rate_limit,
        submitRateLimit: data.submit_rate_limit,
        globalTheme: data.global_theme,
      };
}

/** Theme-only read for authenticated designer previews; settings RLS stays intact. */
export async function getGlobalTheme(): Promise<
  import("survey-core").ITheme | null
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_global_theme");
  if (error)
    throw new Error(`Global theme could not be loaded: ${error.message}`);
  return data;
}

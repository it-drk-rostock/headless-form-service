// Deno-only wiring shared by the public edge functions' entry points: the
// secret-key client and the settings it reads. Handlers never import
// this; they get plain functions injected.
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.117.2";
import type { PublicEndpointSettings } from "./rate-limit.ts";

/**
 * A client with the project's secret key, which the runtime injects as a JSON
 * dictionary. It acts as `service_role`, the only role allowed to read
 * settings and call the functions behind `/load-form` and `/submit-form`
 * (ADR-0004). Throws at boot when the runtime did not inject them.
 */
export function createServiceClient(name: string): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const secretKey = JSON.parse(
    Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}",
  ).default;
  if (!url || !secretKey) {
    throw new Error(
      `${name} needs SUPABASE_URL and SUPABASE_SECRET_KEYS, which the Supabase runtime injects.`,
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The `settings` row's allowed origins and the endpoint's rate limit. */
export async function readEndpointSettings(
  supabase: SupabaseClient,
  endpoint: "load" | "submit",
): Promise<PublicEndpointSettings> {
  const { data, error } = await supabase
    .from("settings")
    .select(`allowed_origins, ${endpoint}_rate_limit`)
    .maybeSingle<Record<string, unknown>>();
  if (error) throw error;
  // Without the row no origin is allowed, so the limit never applies.
  if (data === null) return { allowedOrigins: [], rateLimit: 0 };
  return {
    allowedOrigins: data.allowed_origins as string[],
    rateLimit: data[`${endpoint}_rate_limit`] as number,
  };
}

/**
 * Where QStash delivers queued submissions. `/submit-form` publishes to it
 * and `/dispatch-email` checks QStash's signature against it, so both must
 * build it the same way.
 */
export function dispatchEmailUrl(): string {
  return new URL("/functions/v1/dispatch-email", Deno.env.get("SUPABASE_URL"))
    .href;
}

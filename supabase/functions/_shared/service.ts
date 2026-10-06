// Deno-only wiring shared by the public edge functions' entry points: the
// secret-key client and the allowed origins it reads. Handlers never import
// this; they get plain functions injected.
import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.117.2";

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

/** The `settings` row's allowed origins. */
export async function readAllowedOrigins(
  supabase: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("settings")
    .select("allowed_origins")
    .maybeSingle();
  if (error) throw error;
  return data?.allowed_origins ?? [];
}

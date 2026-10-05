import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env.ts";

/**
 * Supabase with the secret key (`sb_secret_...`), which acts as the
 * `service_role` Postgres role and bypasses RLS. Server only
 * (blueprint §9): use it just for what the signed-in person's client cannot
 * do, i.e. Auth admin calls (invites, set-password links) and finding an
 * account by email. Check authorisation before calling it. Never write
 * team data with it: RLS and the last-Team-Admin trigger trust it blindly.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. See .env.example; never prefix it with NEXT_PUBLIC_.",
    );
  }
  return createClient(supabaseUrl(), key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

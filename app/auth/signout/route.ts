import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/auth/routing.ts";
import { createClient } from "@/lib/supabase/server.ts";

/**
 * Clears a session that has no profile behind it (e.g. the account was deleted
 * while its token is still valid). Server Components cannot clear cookies, so
 * `requireProfile` sends people here; going straight to the login page would
 * bounce them back into the dashboard.
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}

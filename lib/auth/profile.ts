import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "../supabase/server.ts";
import { LOGIN_PATH, SIGN_OUT_PATH } from "./routing.ts";

export type Profile = {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
};

/**
 * The signed-in person's profile, or a redirect to the login page. This is the
 * authoritative session check for pages; the proxy only redirects optimistically.
 * Cached per request, so layout and page share one lookup.
 */
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect(LOGIN_PATH);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, is_super_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `Profile of ${userId} could not be loaded: ${error.message}`,
    );
  }
  // A valid token without a profile: the account is gone. End the session.
  if (!data) redirect(SIGN_OUT_PATH);

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name,
    isSuperAdmin: data.is_super_admin,
  };
});

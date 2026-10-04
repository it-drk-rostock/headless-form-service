import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { LOGIN_PATH } from "@/lib/auth/routing.ts";
import { createClient } from "@/lib/supabase/server.ts";

/** The only email links we send: invites and set-password links (blueprint §2.3). */
const LINK_TYPES = ["invite", "recovery"] as const;
type LinkType = (typeof LINK_TYPES)[number];

function isLinkType(type: string | null): type is LinkType {
  return LINK_TYPES.includes(type as LinkType);
}

/**
 * Target of the links in the auth email templates (`supabase/templates/`).
 * Exchanges the one-time token for a session, then asks for a password.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (tokenHash && isLinkType(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) redirect("/set-password");
  }

  redirect(`${LOGIN_PATH}?error=link`);
}

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { authRedirect } from "../auth/routing.ts";
import { supabasePublishableKey, supabaseUrl } from "./env.ts";

/**
 * Refreshes the Supabase session cookie on every request and sends
 * signed-out visitors to the login page. This is only the optimistic check;
 * pages still verify the session themselves (`requireProfile`).
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Cache-Control etc., so no CDN caches a response carrying a session.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // Nothing may run between creating the client and this call: it validates
  // the JWT and refreshes an expired session, which triggers `setAll`.
  const { data } = await supabase.auth.getClaims();

  const { pathname, search } = request.nextUrl;
  const target = authRedirect({
    path: pathname + search,
    signedIn: Boolean(data?.claims),
  });
  if (!target) return response;

  const redirect = NextResponse.redirect(new URL(target, request.url));
  // Keep refreshed or cleared session cookies on the redirect.
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  for (const key of ["cache-control", "expires", "pragma"]) {
    const value = response.headers.get(key);
    if (value) redirect.headers.set(key, value);
  }
  return redirect;
}

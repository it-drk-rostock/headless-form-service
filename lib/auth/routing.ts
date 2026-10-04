// Where the proxy sends a request, given whether there is a session. Pure, so it is unit-tested.

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/forms";
export const SIGN_OUT_PATH = "/auth/signout";

/** Stand-in origin for resolving relative paths. */
const BASE = "http://dashboard.invalid";

/** Reachable without a session: the login page and the handler for invite and set-password links. */
const PUBLIC_PREFIXES = [LOGIN_PATH, "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Only same-site paths are followed after login, so a crafted `?next=` cannot
 * send people to another site. Anything else lands on the forms list.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith("/")) return HOME_PATH;
  // Resolve the way a browser would: tabs, newlines and backslashes can turn
  // a harmless-looking path into `//other.host`.
  const url = new URL(next, BASE);
  if (url.origin !== BASE || isPublic(url.pathname)) return HOME_PATH;
  return url.pathname + url.search + url.hash;
}

/**
 * The path (with query) to redirect to, or `null` to let the request through.
 * `path` is the requested pathname plus search string.
 */
export function authRedirect({
  path,
  signedIn,
}: {
  path: string;
  signedIn: boolean;
}): string | null {
  const url = new URL(path, BASE);

  if (signedIn) {
    return url.pathname === LOGIN_PATH
      ? safeNextPath(url.searchParams.get("next"))
      : null;
  }

  if (isPublic(url.pathname)) return null;
  if (path === "/") return LOGIN_PATH;
  return `${LOGIN_PATH}?${new URLSearchParams({ next: path })}`;
}

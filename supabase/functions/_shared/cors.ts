// CORS for the public edge functions (blueprint §4.1, §4.2): only pages on
// the allowed origins list may call them. Other origins are refused on the
// server too, not just hidden from the browser. A script outside a browser
// can fake its origin; rate limiting (rate-limit.ts) is what slows those down.
// Web-standard APIs only, like the handlers.
import { jsonResponse } from "../../../lib/shared/http.ts";

/**
 * Lets the request through with its `origin` when that origin is allowed.
 * Otherwise, and for a preflight, returns the `response` to send instead.
 * Requests without an origin are refused: browsers always send one on the
 * cross-origin calls the embed makes.
 */
export function handleCors(
  request: Request,
  allowedOrigins: readonly string[],
  methods: readonly string[],
): { origin: string } | { response: Response } {
  const origin = request.headers.get("origin");
  if (origin === null || !allowedOrigins.includes(origin)) {
    return {
      response: jsonResponse(
        { error: "origin_not_allowed" },
        {
          status: 403,
          headers: { vary: "Origin", "cache-control": "no-store" },
        },
      ),
    };
  }

  if (request.method === "OPTIONS") {
    const response = new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-methods": allowedMethods(methods),
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
    return { response: withCorsHeaders(response, origin) };
  }

  return { origin };
}

/** `methods` plus the preflight's, as the `Allow` headers list them. */
export function allowedMethods(methods: readonly string[]): string {
  return [...methods, "OPTIONS"].join(", ");
}

/** `response`, readable by pages on `origin`. */
export function withCorsHeaders(response: Response, origin: string): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

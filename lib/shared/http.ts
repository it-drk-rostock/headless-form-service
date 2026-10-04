// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

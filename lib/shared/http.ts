// Shared by the dashboard, the edge functions and the embed. Keep this module
// free of Node-, Deno- and Next-specific APIs: Web-standard globals only.

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

import { jsonResponse } from "../../../lib/shared/http.ts";

export type PingDeps = {
  now: () => Date;
};

export function handlePing(request: Request, deps: PingDeps): Response {
  if (request.method !== "GET") {
    return jsonResponse(
      { error: "method_not_allowed" },
      { status: 405, headers: { allow: "GET" } },
    );
  }

  return jsonResponse({ status: "ok", time: deps.now().toISOString() });
}

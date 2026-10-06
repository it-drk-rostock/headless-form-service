// Asks `/load-form` (blueprint §4.1) for a form's current version and sorts
// every answer into something the embed can show. Web-standard APIs only, so
// Vitest tests it in Node with a fake `fetch`.

export type LoadFailure =
  | "not_found"
  | "pass_invalid"
  | "rate_limited"
  | "failed";

export type LoadResult =
  | { kind: "ready"; version: number; schema: object }
  | { kind: "error"; reason: LoadFailure };

export type LoadDeps = {
  /** `/functions/v1/load-form` of the Supabase project. */
  endpoint: string;
  fetch: (input: string) => Promise<Response>;
};

export async function loadForm(
  formId: string,
  { endpoint, fetch }: LoadDeps,
): Promise<LoadResult> {
  // An empty `data-form` can only be a pasting mistake; asking would get 400.
  if (formId.trim() === "") return failure("not_found");

  try {
    const response = await fetch(
      `${endpoint}?${new URLSearchParams({ form_id: formId })}`,
    );
    if (response.status === 404) return failure("not_found");
    if (response.status === 429) return failure("rate_limited");

    const body: unknown = await response.json();
    if (response.status === 403 && errorCode(body) === "form_pass_invalid") {
      return failure("pass_invalid");
    }
    if (response.ok && isLoadedForm(body)) {
      return { kind: "ready", version: body.version, schema: body.schema };
    }
    return failure("failed");
  } catch {
    // Network errors, timeouts, and responses the browser hides because they
    // lack CORS headers (an origin that is not allowed) all end up here.
    return failure("failed");
  }
}

function failure(reason: LoadFailure): LoadResult {
  return { kind: "error", reason };
}

function errorCode(body: unknown): unknown {
  return typeof body === "object" && body !== null && "error" in body
    ? body.error
    : undefined;
}

function isLoadedForm(
  body: unknown,
): body is { version: number; schema: object } {
  return (
    typeof body === "object" &&
    body !== null &&
    "version" in body &&
    typeof body.version === "number" &&
    "schema" in body &&
    typeof body.schema === "object" &&
    body.schema !== null
  );
}

// Sends a submission to `/submit-form` (blueprint §4.2) and sorts every
// answer into something the embed can show. Web-standard APIs only, so
// Vitest tests it in Node with a fake `fetch`.

export type SubmitFailure = "not_found" | "pass_invalid" | "failed";

export type SubmitResult =
  | { kind: "accepted" }
  | { kind: "error"; reason: SubmitFailure };

export type Submission = {
  formId: string;
  version: number;
  /** Generated once per form load and sent again on every retry. */
  submissionId: string;
  answers: Record<string, unknown>;
};

export type SubmitDeps = {
  /** `/functions/v1/submit-form` of the Supabase project. */
  endpoint: string;
  fetch: (input: string, init: RequestInit) => Promise<Response>;
};

export async function submitForm(
  submission: Submission,
  { endpoint, fetch }: SubmitDeps,
): Promise<SubmitResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        form_id: submission.formId,
        version: submission.version,
        submission_id: submission.submissionId,
        answers: submission.answers,
      }),
    });
    // Accepted means sent, to the visitor (GLOSSARY).
    if (response.status === 202) return { kind: "accepted" };
    if (response.status === 404) return failure("not_found");
    if (
      response.status === 403 &&
      (await errorCode(response)) === "form_pass_invalid"
    ) {
      return failure("pass_invalid");
    }
    return failure("failed");
  } catch {
    // Network errors, timeouts, and responses the browser hides because they
    // lack CORS headers (an origin that is not allowed) all end up here.
    return failure("failed");
  }
}

/**
 * A random UUID (version 4) for one form load. `crypto.randomUUID` is missing
 * on pages without HTTPS and in older browsers; `getRandomValues` is not.
 */
export function newSubmissionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4),
    hex.slice(4, 6),
    hex.slice(6, 8),
    hex.slice(8, 10),
    hex.slice(10, 16),
  ]
    .map((group) => group.join(""))
    .join("-");
}

function failure(reason: SubmitFailure): SubmitResult {
  return { kind: "error", reason };
}

async function errorCode(response: Response): Promise<unknown> {
  const body: unknown = await response.json();
  return typeof body === "object" && body !== null && "error" in body
    ? body.error
    : undefined;
}

// Cloudflare Turnstile, the bot check of `/submit-form` (blueprint §4.2).
// The widget in the embed hands the visitor a token; this asks Cloudflare
// whether it is real. Web-standard, so Vitest tests it with a fake `fetch`.

/**
 * True when Cloudflare confirms `token`, false when it refuses it (invalid,
 * expired or already used). Throws when it cannot tell.
 */
export type TurnstileVerifier = (
  token: string,
  visitor: { ip: string },
) => Promise<boolean>;

export const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** The visitor waits on this. */
const TIMEOUT_MS = 5_000;

/**
 * Codes that say nothing about the token: Cloudflare failed, or the secret
 * is wrong. Those are outages to fix, not bots to refuse.
 */
const UNABLE_TO_TELL = new Set([
  "internal-error",
  "missing-input-secret",
  "invalid-input-secret",
  "bad-request",
]);

export function createTurnstileVerifier(
  secret: string,
  fetch: (
    url: string,
    init: RequestInit,
  ) => Promise<Response> = globalThis.fetch,
): TurnstileVerifier {
  return async (token, { ip }) => {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret,
        response: token,
        // `clientIp` gives "unknown" when the edge sent no address.
        ...(ip === "unknown" ? {} : { remoteip: ip }),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Turnstile siteverify answered ${response.status}`);
    }
    const result = (await response.json()) as {
      success?: unknown;
      "error-codes"?: unknown;
    };
    const codes = Array.isArray(result["error-codes"])
      ? result["error-codes"]
      : [];
    const unable = codes.filter((code) => UNABLE_TO_TELL.has(code));
    if (unable.length > 0) {
      throw new Error(`Turnstile siteverify failed: ${unable.join(", ")}`);
    }
    return result.success === true;
  };
}

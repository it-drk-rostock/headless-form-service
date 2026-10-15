// `/load-form` (blueprint §4.1, ADR-0004): the embed's only way to get a
// form. Serves the current version of a published, not archived form to
// pages on the allowed origins, and counts each load. A closed form gets
// only its closed state, so the embed shows the closed notice.

import {
  FORM_PASS_PARAM,
  hashFormPassSecret,
} from "../../../lib/shared/form-pass.ts";
import { noStoreJsonResponse as reply } from "../../../lib/shared/http.ts";
import { isUuid } from "../../../lib/shared/uuid.ts";
import { allowedMethods, withCorsHeaders } from "../_shared/cors.ts";
import {
  admitPublicRequest,
  type PublicEndpointSettings,
  type RateLimiter,
} from "../_shared/rate-limit.ts";

/** What a visitor may be served of a form: its current version. */
export type LoadedForm = {
  version: number;
  schema: unknown;
  theme: Record<string, unknown> | null;
  accessType: "public" | "protected";
  /** Whether the embed must show the Turnstile widget. */
  turnstileEnabled: boolean;
  /** A closed form takes no submissions; its questions are not handed out. */
  isClosed: boolean;
};

export type LoadFormDeps = {
  /** With the load limit as `rateLimit`. */
  settings: () => Promise<PublicEndpointSettings>;
  withinRateLimit: RateLimiter;
  /** Null for an unknown, unpublished or archived form. */
  loadForm: (formId: string) => Promise<LoadedForm | null>;
  /** Read-only lookup, scoped to this form and the secret's SHA-256 hash. */
  loadPass: (
    formId: string,
    tokenHash: string,
  ) => Promise<LoadedFormPass | null>;
  now: () => number;
  /** Adds one to today's load count of the form. */
  countLoad: (formId: string) => Promise<void>;
  /** Cloudflare's public key for the widget, handed out per form. */
  turnstileSiteKey: string;
};

/** Only the fields needed to validate a pass; no secret or metadata. */
export type LoadedFormPass = {
  max_uses: number | null;
  use_count: number;
  expires_at: string | null;
  revoked_at: string | null;
};

const METHODS = ["GET"];

/** Loads per minute and IP (blueprint §4.1). */
const RATE_LIMIT_WINDOW = "1 m";

export async function handleLoadForm(
  request: Request,
  deps: LoadFormDeps,
): Promise<Response> {
  let origin: string | null = null;
  try {
    const admitted = await admitPublicRequest(request, {
      settings: await deps.settings(),
      window: RATE_LIMIT_WINDOW,
      withinRateLimit: deps.withinRateLimit,
      methods: METHODS,
    });
    if ("response" in admitted) return admitted.response;
    origin = admitted.origin;

    return withCorsHeaders(await serve(request, deps), origin);
  } catch (error) {
    console.error("load-form failed", error);
    const response = reply({ error: "internal_error" }, 500);
    return origin === null ? response : withCorsHeaders(response, origin);
  }
}

async function serve(request: Request, deps: LoadFormDeps): Promise<Response> {
  if (request.method !== "GET") {
    return reply({ error: "method_not_allowed" }, 405, {
      allow: allowedMethods(METHODS),
    });
  }

  const params = new URL(request.url).searchParams;
  const formId = params.get("form_id");
  if (!formId) return reply({ error: "form_id_missing" }, 400);

  const form = isUuid(formId) ? await deps.loadForm(formId) : null;
  if (form === null) return reply({ error: "form_not_found" }, 404);

  // Closed comes before the pass check (blueprint §4.1): nobody could submit
  // anyway, so there is nothing to protect. Not counted as a load.
  if (form.isClosed) return reply({ state: "closed" });

  if (form.accessType === "protected") {
    const secret = params.get(FORM_PASS_PARAM);
    const pass = secret
      ? await deps.loadPass(formId, await hashFormPassSecret(secret))
      : null;
    if (
      pass === null ||
      pass.revoked_at !== null ||
      (pass.expires_at !== null &&
        !(Date.parse(pass.expires_at) > deps.now())) ||
      (pass.max_uses !== null && pass.use_count >= pass.max_uses)
    ) {
      return reply({ error: "form_pass_invalid" }, 403);
    }
  }

  // The count is only for statistics, so a failure there must not keep the
  // form from visitors.
  try {
    await deps.countLoad(formId);
  } catch (error) {
    console.error("load-form could not count the load", error);
  }
  return reply({
    version: form.version,
    schema: form.schema,
    theme: form.theme ?? null,
    access_type: form.accessType,
    ...(form.turnstileEnabled
      ? { turnstile_site_key: deps.turnstileSiteKey }
      : {}),
  });
}

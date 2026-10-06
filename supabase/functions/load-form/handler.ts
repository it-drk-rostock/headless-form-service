// `/load-form` (blueprint §4.1, ADR-0004): the embed's only way to get a
// form. Serves the current version of a published, not archived form to
// pages on the allowed origins, and counts each load.
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
  accessType: "public" | "protected";
};

export type LoadFormDeps = {
  /** With the load limit as `rateLimit`. */
  settings: () => Promise<PublicEndpointSettings>;
  withinRateLimit: RateLimiter;
  /** Null for an unknown, unpublished or archived form. */
  loadForm: (formId: string) => Promise<LoadedForm | null>;
  /** Adds one to today's load count of the form. */
  countLoad: (formId: string) => Promise<void>;
};

const METHODS = ["GET"];

export async function handleLoadForm(
  request: Request,
  deps: LoadFormDeps,
): Promise<Response> {
  let origin: string | null = null;
  try {
    const admitted = await admitPublicRequest(
      request,
      await deps.settings(),
      deps.withinRateLimit,
      METHODS,
    );
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

  const formId = new URL(request.url).searchParams.get("form_id");
  if (!formId) return reply({ error: "form_id_missing" }, 400);

  const form = isUuid(formId) ? await deps.loadForm(formId) : null;
  if (form === null) return reply({ error: "form_not_found" }, 404);

  // Protected forms need a valid form pass, which ticket 26 checks. Until
  // then their questions are never handed out (ADR-0004).
  if (form.accessType === "protected") {
    return reply({ error: "form_pass_invalid" }, 403);
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
    access_type: form.accessType,
  });
}

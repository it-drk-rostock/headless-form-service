// `/generate-form-pass` (blueprint §7, ADR-0005): n8n's only way in. It
// creates form passes for protected forms with n8n's one global integration
// key, never with the secret key. The secret is made here, returned once and
// stored only as its hash, as the dashboard does.
import {
  formPassUrl,
  generateFormPassSecret,
  hashFormPassSecret,
  isCountUpTo,
  PASS_DEFAULT_EXPIRY_HOURS,
  PASS_DEFAULT_MAX_USES,
  PASS_EXPIRY_MAX_HOURS,
  PASS_MAX_USES_LIMIT,
  type PassMetadata,
  passMetadataProblem,
} from "../../../lib/shared/form-pass.ts";
import { noStoreJsonResponse as reply } from "../../../lib/shared/http.ts";
import { isObject } from "../../../lib/shared/object.ts";
import {
  type PassContext,
  parsePassContext,
} from "../../../lib/shared/pass-context.ts";
import { isUuid } from "../../../lib/shared/uuid.ts";

/** A pass to store, with the secret's hash only. */
export type NewFormPass = {
  formId: string;
  tokenHash: string;
  /** Null: unlimited until expiry. */
  maxUses: number | null;
  expiresAt: string;
  metadata: PassMetadata;
  context?: PassContext;
};

/** The stored pass's form page (null when unset), or why it was refused. */
export type CreatedFormPass =
  | { pageUrl: string | null }
  | "form_not_found"
  | "form_not_protected"
  | "prefill_invalid"
  | "recipient_not_allowed";

export type GenerateFormPassDeps = {
  /** `N8N_INTEGRATION_KEY`, the Bearer key n8n sends. */
  integrationKey: string;
  now: () => number;
  /** Stores the pass with source `n8n`. Unknown and archived forms are not found. */
  createPass: (pass: NewFormPass) => Promise<CreatedFormPass>;
};

/** The request body's keys (blueprint §7); others are refused. */
const REQUEST_FIELDS = [
  "form_id",
  "max_uses",
  "expires_in_hours",
  "metadata",
  "prefill",
  "locked_fields",
  "recipient",
];

export async function handleGenerateFormPass(
  request: Request,
  deps: GenerateFormPassDeps,
): Promise<Response> {
  try {
    if (request.method !== "POST") {
      return reply({ error: "method_not_allowed" }, 405, { allow: "POST" });
    }
    if (!(await isIntegrationKey(request, deps.integrationKey))) {
      return reply({ error: "unauthorized" }, 401, {
        "www-authenticate": "Bearer",
      });
    }

    const input = parseInput(await request.text());
    if ("invalid" in input) {
      return reply(
        input.invalid === null
          ? { error: "request_invalid" }
          : { error: "request_invalid", field: input.invalid },
        400,
      );
    }

    const secret = generateFormPassSecret();
    const expiresAt = new Date(
      deps.now() + input.expiresInHours * 3_600_000,
    ).toISOString();
    const created = await deps.createPass({
      formId: input.formId,
      tokenHash: await hashFormPassSecret(secret),
      maxUses: input.maxUses,
      expiresAt,
      metadata: input.metadata,
      ...(input.context ? { context: input.context } : {}),
    });
    if (created === "prefill_invalid" || created === "recipient_not_allowed")
      return reply({ error: created }, 422);
    if (created === "form_not_found") {
      return reply({ error: "form_not_found" }, 404);
    }
    if (created === "form_not_protected") {
      return reply({ error: "form_not_protected" }, 409);
    }

    return reply(
      {
        form_pass: secret,
        expires_at: expiresAt,
        ...(created.pageUrl === null
          ? {}
          : { url: formPassUrl(created.pageUrl, secret) }),
      },
      201,
    );
  } catch (error) {
    console.error("generate-form-pass failed", error);
    return reply({ error: "internal_error" }, 500);
  }
}

/**
 * Whether the request carries `Authorization: Bearer <key>`. The SHA-256
 * digests are compared in full, so the time taken says nothing about how much
 * of the key was right.
 */
async function isIntegrationKey(
  request: Request,
  key: string,
): Promise<boolean> {
  const match = /^Bearer (.+)$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (match === null || key === "") return false;
  const [given, expected] = await Promise.all([sha256(match[1]), sha256(key)]);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) {
    difference |= given[i] ^ expected[i];
  }
  return difference === 0;
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  );
}

type ParsedInput =
  | {
      formId: string;
      maxUses: number | null;
      expiresInHours: number;
      metadata: PassMetadata;
      context?: PassContext;
    }
  /** The field that is missing, unknown or invalid; null for no JSON object. */
  | { invalid: string | null };

/**
 * The request body, with blueprint §7's defaults: one use, 48 hours, no
 * metadata. Only a use limit can be null (unlimited); every pass expires.
 */
function parseInput(text: string): ParsedInput {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { invalid: null };
  }
  if (!isObject(body)) return { invalid: null };

  const unknown = Object.keys(body).find(
    (key) => !REQUEST_FIELDS.includes(key),
  );
  if (unknown !== undefined) return { invalid: unknown };

  const formId = body.form_id;
  if (typeof formId !== "string" || !isUuid(formId)) {
    return { invalid: "form_id" };
  }
  const maxUses =
    body.max_uses === undefined ? PASS_DEFAULT_MAX_USES : body.max_uses;
  if (maxUses !== null && !isCountUpTo(maxUses, PASS_MAX_USES_LIMIT)) {
    return { invalid: "max_uses" };
  }
  const expiresInHours =
    body.expires_in_hours === undefined
      ? PASS_DEFAULT_EXPIRY_HOURS
      : body.expires_in_hours;
  if (!isCountUpTo(expiresInHours, PASS_EXPIRY_MAX_HOURS)) {
    return { invalid: "expires_in_hours" };
  }
  const metadata = body.metadata === undefined ? {} : body.metadata;
  if (passMetadataProblem(metadata) !== null) return { invalid: "metadata" };

  const hasContext = ["prefill", "locked_fields", "recipient"].some((key) =>
    Object.hasOwn(body, key),
  );
  const context = hasContext ? parsePassContext(body) : undefined;
  if (context === null) return { invalid: "pass_context" };

  return {
    ...(context ? { context } : {}),
    formId,
    maxUses,
    expiresInHours,
    metadata: metadata as PassMetadata,
  };
}

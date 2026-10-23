// `/submit-form` (blueprint §4.2, ADR-0001, ADR-0004): the embed's only way
// to send a submission. Records it in `form_stats` and queues its answers,
// encrypted, in QStash, from where `/dispatch-email` delivers them. Answers
// are stored nowhere on the way.

import { answerProblems } from "../../../lib/shared/answer-validation.ts";
import { type Answers, pickAnswers } from "../../../lib/shared/answers.ts";
import { hashFormPassSecret } from "../../../lib/shared/form-pass.ts";
import { noStoreJsonResponse as reply } from "../../../lib/shared/http.ts";
import { isObject } from "../../../lib/shared/object.ts";
import {
  enforcePassFields,
  type PassContext,
  prefillFitsSchema,
} from "../../../lib/shared/pass-context.ts";
import { isUuid } from "../../../lib/shared/uuid.ts";
import { allowedMethods, withCorsHeaders } from "../_shared/cors.ts";
import {
  admitPublicRequest,
  clientIp,
  type PublicEndpointSettings,
  type RateLimiter,
} from "../_shared/rate-limit.ts";
import type {
  EncryptedSubmission,
  QueuedSubmission,
  SubmissionIds,
  SubmissionPayload,
} from "../_shared/submission-crypto.ts";
import type { TurnstileVerifier } from "../_shared/turnstile.ts";

/** The submitted version of a form that takes submissions. */
export type SubmittedForm = {
  schema: unknown;
  accessType: "public" | "protected";
  /** The form's bot check, as set now (it lives on the form, not the version). */
  turnstileEnabled: boolean;
  /** Whether the form is closed now; a closed form takes no submissions. */
  isClosed: boolean;
};

export type PublishRequest = {
  body: QueuedSubmission;
  /** QStash drops a message whose ID it has seen recently. */
  deduplicationId: string;
  retries: number;
};

export type SubmitFormDeps = {
  /** With the submit limit as `rateLimit`. */
  settings: () => Promise<PublicEndpointSettings>;
  withinRateLimit: RateLimiter;
  /** Null for an unknown version, or a form unpublished or archived. */
  loadVersion: (
    formId: string,
    version: number,
  ) => Promise<SubmittedForm | null>;
  verifyTurnstile: TurnstileVerifier;
  /** Atomically uses a valid pass for this form; null when it is invalid. */
  claimPass: (ids: SubmissionIds, tokenHash: string) => Promise<string | null>;
  /** Finishes this attempt; retries of one submission share one reserved use. */
  finishPass: (submissionId: string, accepted: boolean) => Promise<void>;
  loadPassContext: (
    formId: string,
    passId: string,
  ) => Promise<PassContext | null>;
  /**
   * Writes the `queued` stats row. False once QStash's message ID is recorded
   * for that ID: a retry of a submission QStash already has.
   */
  queue: (ids: SubmissionIds) => Promise<boolean>;
  /** Removes the stats row of a submission that could not be queued. */
  unqueue: (submissionId: string) => Promise<void>;
  /** Keeps QStash's message ID with the stats row. */
  recordMessage: (submissionId: string, messageId: string) => Promise<void>;
  encrypt: (
    ids: SubmissionIds,
    payload: SubmissionPayload,
  ) => Promise<EncryptedSubmission>;
  publish: (request: PublishRequest) => Promise<{ messageId: string }>;
};

const METHODS = ["POST"];

/** Submissions per hour and IP (blueprint §4.2). */
const RATE_LIMIT_WINDOW = "1 h";

/** QStash retries after the first attempt, with exponential backoff (§4.3). */
const RETRIES = 3;

/** The largest request body taken, in bytes (blueprint §4.2). */
const MAX_BODY_BYTES = 64 * 1024;

export async function handleSubmitForm(
  request: Request,
  deps: SubmitFormDeps,
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

    return withCorsHeaders(await submit(request, deps), origin);
  } catch (error) {
    console.error("submit-form failed", error);
    const response = reply({ error: "internal_error" }, 500);
    return origin === null ? response : withCorsHeaders(response, origin);
  }
}

async function submit(
  request: Request,
  deps: SubmitFormDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405, {
      allow: allowedMethods(METHODS),
    });
  }

  // Checked while reading, so an oversized body is never held in full.
  const text = await readBody(request);
  if (text === null) return reply({ error: "payload_too_large" }, 413);
  const submission = parseSubmission(text);
  if (submission === null) return reply({ error: "request_invalid" }, 400);
  const { ids, answers, formPass, turnstileToken, honeypot } = submission;

  // Only bots fill the hidden field. They are told it worked, so they don't
  // try again differently, and nothing is checked, stored or sent.
  if (honeypot !== "") {
    // No answers, only that it happened, to spot autofill dropping people.
    console.warn("submit-form dropped a filled honeypot", ids.formId);
    return accepted();
  }

  const form = await deps.loadVersion(ids.formId, ids.version);
  if (form === null) return reply({ error: "form_not_found" }, 404);
  // Also for visitors who loaded the form before it was closed. Nothing else
  // is checked, so the visitor learns why straight away.
  if (form.isClosed) return reply({ error: "form_closed" }, 409);

  if (form.turnstileEnabled) {
    const refused = await checkTurnstile(request, turnstileToken, deps);
    if (refused) return refused;
  }

  let passId: string | null = null;
  if (form.accessType === "protected") {
    if (formPass === "") return reply({ error: "form_pass_invalid" }, 403);
    passId = await deps.claimPass(ids, await hashFormPassSecret(formPass));
    if (passId === null) return reply({ error: "form_pass_invalid" }, 403);
  }

  let picked: Answers;
  try {
    const context = passId
      ? await deps.loadPassContext(ids.formId, passId)
      : null;
    const enforced = context ? enforcePassFields(answers, context) : answers;
    picked = pickAnswers(form.schema, enforced ?? {});
    if (
      (context && !prefillFitsSchema(form.schema, context)) ||
      enforced === null ||
      answerProblems(form.schema, picked).length > 0
    ) {
      await finishClaim(passId, ids.submissionId, false, deps);
      return reply({ error: "answers_invalid" }, 422);
    }
  } catch (error) {
    await finishClaim(passId, ids.submissionId, false, deps);
    throw error;
  }

  let encrypted: EncryptedSubmission;
  let queued: boolean;
  try {
    encrypted = await deps.encrypt(ids, { answers: picked, pass_id: passId });
    queued = await deps.queue(ids);
  } catch (error) {
    await finishClaim(passId, ids.submissionId, false, deps);
    throw error;
  }

  // A confirmed retry is no new submission, so it keeps no extra pass use.
  // Unconfirmed publishes are retried under QStash's deduplication ID.
  if (!queued) {
    await finishClaim(passId, ids.submissionId, false, deps);
    return accepted();
  }

  let messageId: string;
  try {
    ({ messageId } = await deps.publish({
      body: {
        submission_id: ids.submissionId,
        form_id: ids.formId,
        version: ids.version,
        encrypted,
      },
      deduplicationId: ids.submissionId,
      retries: RETRIES,
    }));
  } catch (error) {
    console.error("submit-form could not publish to QStash", error);
    await finishClaim(passId, ids.submissionId, false, deps);
    // Without its row the visitor can send the same submission again.
    try {
      await deps.unqueue(ids.submissionId);
    } catch (unqueueError) {
      console.error("submit-form could not remove the stats row", unqueueError);
    }
    return reply({ error: "queue_unavailable" }, 503);
  }

  await finishClaim(passId, ids.submissionId, true, deps);

  // The message ID only helps find a dead-lettered message later, so the
  // submission is accepted without it.
  try {
    await deps.recordMessage(ids.submissionId, messageId);
  } catch (error) {
    console.error("submit-form could not keep the message ID", error);
  }
  return accepted();
}

/** Cleanup is best effort; a database outage must not hide the original error. */
async function finishClaim(
  passId: string | null,
  submissionId: string,
  accepted: boolean,
  deps: SubmitFormDeps,
) {
  if (passId === null) return;
  try {
    await deps.finishPass(submissionId, accepted);
  } catch (error) {
    console.error("submit-form could not finish the form pass claim", error);
  }
}

/**
 * 403 for a missing or invalid Turnstile token, 503 when Cloudflare cannot
 * tell. Null when the visitor passed. Each token is good for one check, so
 * the embed gets a new one for every attempt.
 */
async function checkTurnstile(
  request: Request,
  token: string,
  deps: SubmitFormDeps,
): Promise<Response | null> {
  if (token === "") return reply({ error: "turnstile_invalid" }, 403);
  let passed: boolean;
  try {
    passed = await deps.verifyTurnstile(token, { ip: clientIp(request) });
  } catch (error) {
    console.error("submit-form could not verify Turnstile", error);
    return reply({ error: "turnstile_unavailable" }, 503);
  }
  return passed ? null : reply({ error: "turnstile_invalid" }, 403);
}

/** The request body as text, or null once it is over `MAX_BODY_BYTES`. */
async function readBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return null;
  }
  if (request.body === null) return "";
  // The header may be missing or wrong, so the bytes themselves are counted.
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/** The request body, or null when it is not a well-formed submission. */
function parseSubmission(text: string): {
  ids: SubmissionIds;
  answers: Answers;
  /** Empty for a missing or malformed pass; only protected forms need it. */
  formPass: string;
  /** Empty when there is none; only forms with Turnstile on need one. */
  turnstileToken: string;
  /** The hidden field's value, empty from people. */
  honeypot: string;
} | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(body)) return null;

  const {
    form_id,
    version,
    submission_id,
    answers,
    form_pass,
    turnstile_token,
    honeypot = "",
  } = body;
  if (
    typeof form_id !== "string" ||
    !isUuid(form_id) ||
    typeof version !== "number" ||
    !Number.isSafeInteger(version) ||
    version < 1 ||
    typeof submission_id !== "string" ||
    !isUuid(submission_id) ||
    !isObject(answers) ||
    typeof honeypot !== "string"
  ) {
    return null;
  }
  return {
    // Lowercase, so a retry spelled differently is still the same row.
    ids: {
      submissionId: submission_id.toLowerCase(),
      formId: form_id.toLowerCase(),
      version,
    },
    answers,
    formPass: typeof form_pass === "string" ? form_pass : "",
    turnstileToken: typeof turnstile_token === "string" ? turnstile_token : "",
    honeypot: honeypot.trim(),
  };
}

/** Accepted means sent, to the visitor (GLOSSARY). */
function accepted(): Response {
  return reply({ status: "accepted" }, 202);
}

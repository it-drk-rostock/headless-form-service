// `/dispatch-email` (blueprint §4.4, ADR-0001): QStash delivers each queued
// submission here. Only QStash may call it, which its signature proves. The
// answers are decrypted only to render the notification email, which goes to
// the form's recipients through Mailjet; nothing of them is stored or logged.
// After QStash's last retry its failure callback comes here too (§4.5).

import type { PassMetadata } from "../../../lib/shared/form-pass.ts";
import { noStoreJsonResponse as reply } from "../../../lib/shared/http.ts";
import {
  DEFAULT_SENDER_NAME,
  parseEmailTemplate,
  renderNotificationEmail,
  replyToAddress,
  senderName,
} from "../../../lib/shared/notification.ts";
import {
  enforcePassFields,
  type PassContext,
} from "../../../lib/shared/pass-context.ts";
import { splitByAllowedDomain } from "../../../lib/shared/recipient-domains.ts";
import type { Mail } from "../_shared/mailjet.ts";
import {
  type EncryptedSubmission,
  parseQueuedSubmission,
  type SubmissionIds,
  type SubmissionPayload,
} from "../_shared/submission-crypto.ts";
import {
  type FailureCallback,
  parseFailureCallback,
  renderFailureAlert,
} from "./failure.ts";

/** `public.submission_status`, the delivery status in `form_stats`. */
export type SubmissionStatus = "queued" | "sent" | "failed";

/** What the database knows about a queued submission and its form. */
export type DispatchedSubmission = {
  formName: string;
  recipients: string[];
  /** The submitted version's `email_template` (ADR-0003). */
  template: unknown;
  /** The submitted version's questions. */
  schema: unknown;
  submittedAt: Date;
  /** Null when the stats row is gone; the email is sent all the same. */
  status: SubmissionStatus | null;
  /** The form's name for the sender; empty for the service's own. */
  senderDisplayName: string;
  /** The question whose answer becomes Reply-To, if the form has one. */
  replyToQuestion: string | null;
  /** The global list as it is now; recipients elsewhere get nothing. */
  allowedRecipientDomains: string[];
};

/** A submission marked failed, and whom to alert (blueprint §4.5). */
export type RecordedFailure = {
  formName: string;
  teamName: string;
  /** The email addresses of the form's team's Team Admins. */
  teamAdmins: string[];
  /** Null when the stats row is gone. */
  submittedAt: Date | null;
  /**
   * The row's status afterwards: `sent` is left as it is, since the email
   * went out after all; null when the stats row is gone.
   */
  status: SubmissionStatus | null;
};

export type DispatchEmailDeps = {
  /** Whether QStash signed exactly this body for this function. */
  verifySignature: (signature: string, body: string) => Promise<boolean>;
  decrypt: (
    ids: SubmissionIds,
    envelope: EncryptedSubmission,
  ) => Promise<SubmissionPayload>;
  /** Null when the form version does not exist (any more). */
  loadSubmission: (ids: SubmissionIds) => Promise<DispatchedSubmission | null>;
  /**
   * The metadata of the form's pass `passId` (ticket 28); null when the pass
   * is gone.
   */
  loadPassMetadata: (
    formId: string,
    passId: string,
  ) => Promise<PassMetadata | null>;
  loadPassContext: (
    formId: string,
    passId: string,
  ) => Promise<PassContext | null>;
  /** Throws when Mailjet did not accept the email. */
  send: (mail: Mail) => Promise<void>;
  markSent: (submissionId: string) => Promise<void>;
  /**
   * Marks the submission `failed` with `reason`, unless it was `sent`. Null
   * when the form is gone.
   */
  recordFailure: (
    ids: SubmissionIds,
    reason: string,
  ) => Promise<RecordedFailure | null>;
  /** The global sender address (GLOSSARY, Sender). */
  senderEmail: string;
};

const METHODS = "POST";

/**
 * Any answer other than 2xx makes QStash retry, and after the retries the
 * message goes to the dead-letter queue (blueprint §4.3).
 */
export async function handleDispatchEmail(
  request: Request,
  deps: DispatchEmailDeps,
): Promise<Response> {
  try {
    return await dispatch(request, deps);
  } catch (error) {
    console.error("dispatch-email failed", error);
    return reply({ error: "internal_error" }, 500);
  }
}

async function dispatch(
  request: Request,
  deps: DispatchEmailDeps,
): Promise<Response> {
  if (request.method !== "POST") {
    return reply({ error: "method_not_allowed" }, 405, { allow: METHODS });
  }

  const body = await request.text();
  const signature = request.headers.get("upstash-signature");
  if (!signature || !(await deps.verifySignature(signature, body))) {
    return reply({ error: "signature_invalid" }, 401);
  }

  const failure = parseFailureCallback(body);
  if (failure !== null) return reportFailure(failure, deps);

  const message = parseQueuedSubmission(body);
  if (message === null) return reply({ error: "request_invalid" }, 400);
  const { ids, encrypted } = message;

  const submission = await deps.loadSubmission(ids);
  if (submission === null) {
    console.error(
      `dispatch-email: version ${ids.version} of form ${ids.formId} not found`,
    );
    return reply({ error: "form_not_found" }, 404);
  }
  // QStash delivers at least once: a redelivery after a lost answer.
  if (submission.status === "sent") return sentResponse();

  let payload: SubmissionPayload;
  try {
    payload = await deps.decrypt(ids, encrypted);
  } catch (error) {
    // An unknown key or a ciphertext not bound to these IDs. Readable only
    // once the key is back, so the message is kept for the dead-letter queue.
    console.error(`dispatch-email cannot decrypt ${ids.submissionId}`, error);
    return reply({ error: "submission_unreadable" }, 422);
  }

  const context = payload.pass_id
    ? await deps.loadPassContext(ids.formId, payload.pass_id)
    : null;
  if (context) {
    const enforced = enforcePassFields(payload.answers, context);
    if (enforced === null) return reply({ error: "answers_invalid" }, 422);
    payload.answers = enforced;
  }
  const addresses = context?.recipient
    ? [context.recipient]
    : submission.recipients;
  if (addresses.length === 0) {
    console.error(`dispatch-email: form ${ids.formId} has no recipients`);
    return reply({ error: "no_recipients" }, 422);
  }
  // The dashboard and the database refuse other recipients, but the list may
  // have shrunk since the form was saved (defence in depth, ticket 21).
  const recipients = splitByAllowedDomain(
    addresses,
    submission.allowedRecipientDomains,
  );
  if (recipients.refused.length > 0) {
    console.error(
      `dispatch-email: form ${ids.formId} has ${recipients.refused.length} recipient(s) outside the allowed domains, not sent to`,
    );
  }
  if (recipients.allowed.length === 0) {
    return reply({ error: "recipients_not_allowed" }, 422);
  }
  const template = parseEmailTemplate(submission.template);
  if (template === null) {
    console.error(
      `dispatch-email: version ${ids.version} of form ${ids.formId} has no readable email template`,
    );
    return reply({ error: "template_invalid" }, 422);
  }

  // The pass as it is now; a pass that is gone has no metadata to fill in.
  // Messages queued before ticket 27 have no `pass_id` at all.
  const passMetadata =
    typeof payload.pass_id !== "string"
      ? undefined
      : ((await deps.loadPassMetadata(ids.formId, payload.pass_id)) ?? {});
  const { subject, html } = renderNotificationEmail(template, {
    formName: submission.formName,
    submittedAt: submission.submittedAt,
    schema: submission.schema,
    answers: payload.answers,
    passMetadata,
  });
  // Like recipients and the display name, the Reply-To question is the
  // form's as it is now (ADR-0003); the answer is the submission's.
  const replyTo = replyToAddress(payload.answers, submission.replyToQuestion);
  try {
    await deps.send({
      from: {
        email: deps.senderEmail,
        name: senderName(submission.senderDisplayName),
      },
      to: recipients.allowed,
      ...(replyTo ? { replyTo } : {}),
      subject,
      html,
      customId: ids.submissionId,
    });
  } catch (error) {
    console.error(`dispatch-email could not send ${ids.submissionId}`, error);
    return reply({ error: "mail_failed" }, 502);
  }

  // The email is out. A retry would send it again, so the delivery counts as
  // done even when its status cannot be kept.
  try {
    await deps.markSent(ids.submissionId);
  } catch (error) {
    console.error(
      `dispatch-email could not mark ${ids.submissionId} sent`,
      error,
    );
  }
  return sentResponse();
}

/**
 * Failure mode: marks the submission failed and alerts the team's Team
 * Admins. A non-2xx answer makes QStash retry the callback, which marks it
 * again and repeats the alert.
 */
async function reportFailure(
  { ids, reason }: FailureCallback,
  deps: DispatchEmailDeps,
): Promise<Response> {
  console.error(
    `dispatch-email: delivery of ${ids.submissionId} failed: ${reason}`,
  );
  const recorded = await deps.recordFailure(ids, reason);
  if (recorded === null) {
    console.error(
      `dispatch-email: form ${ids.formId} is gone, no failure alert for ${ids.submissionId}`,
    );
    return reply({ status: "form_not_found" }, 200);
  }
  if (recorded.status === "sent") return sentResponse();

  if (recorded.teamAdmins.length === 0) {
    console.error(
      `dispatch-email: the team of form ${ids.formId} has no Team Admin to alert`,
    );
    return failedResponse();
  }
  const { subject, html } = renderFailureAlert({
    formName: recorded.formName,
    teamName: recorded.teamName,
    ids,
    submittedAt: recorded.submittedAt,
    reason,
  });
  try {
    await deps.send({
      from: { email: deps.senderEmail, name: DEFAULT_SENDER_NAME },
      to: recorded.teamAdmins,
      subject,
      html,
      customId: `failure-${ids.submissionId}`,
    });
  } catch (error) {
    console.error(
      `dispatch-email could not alert about ${ids.submissionId}`,
      error,
    );
    return reply({ error: "alert_failed" }, 502);
  }
  return failedResponse();
}

function failedResponse(): Response {
  return reply({ status: "failed" }, 200);
}

function sentResponse(): Response {
  return reply({ status: "sent" }, 200);
}

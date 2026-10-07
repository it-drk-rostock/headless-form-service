// `/dispatch-email` (blueprint §4.4, ADR-0001): QStash delivers each queued
// submission here. Only QStash may call it, which its signature proves. The
// answers are decrypted only to render the notification email, which goes to
// the form's recipients through Mailjet; nothing of them is stored or logged.
import { noStoreJsonResponse as reply } from "../../../lib/shared/http.ts";
import {
  parseEmailTemplate,
  renderNotificationEmail,
  replyToAddress,
  senderName,
} from "../../../lib/shared/notification.ts";
import { splitByAllowedDomain } from "../../../lib/shared/recipient-domains.ts";
import type { Mail } from "../_shared/mailjet.ts";
import {
  type EncryptedSubmission,
  parseQueuedSubmission,
  type SubmissionIds,
  type SubmissionPayload,
} from "../_shared/submission-crypto.ts";

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
  status: "queued" | "sent" | "failed" | null;
  /** The form's name for the sender; empty for the service's own. */
  senderDisplayName: string;
  /** The question whose answer becomes Reply-To, if the form has one. */
  replyToQuestion: string | null;
  /** The global list as it is now; recipients elsewhere get nothing. */
  allowedRecipientDomains: string[];
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
  /** Throws when Mailjet did not accept the email. */
  send: (mail: Mail) => Promise<void>;
  markSent: (submissionId: string) => Promise<void>;
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

  if (submission.recipients.length === 0) {
    console.error(`dispatch-email: form ${ids.formId} has no recipients`);
    return reply({ error: "no_recipients" }, 422);
  }
  // The dashboard and the database refuse other recipients, but the list may
  // have shrunk since the form was saved (defence in depth, ticket 21).
  const recipients = splitByAllowedDomain(
    submission.recipients,
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

  const { subject, html } = renderNotificationEmail(template, {
    formName: submission.formName,
    submittedAt: submission.submittedAt,
    schema: submission.schema,
    answers: payload.answers,
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

function sentResponse(): Response {
  return reply({ status: "sent" }, 200);
}

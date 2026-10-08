// Delivery failures (blueprint §4.5): once QStash has used up its retries on
// a queued submission, it calls `/dispatch-email` again with a failure
// callback. Its body names the source message and the last answer this
// function gave it, never anything readable of the submission (ADR-0001).
import {
  detailsTable,
  escapeHtml,
  formatSubmittedAt,
  standardLayoutHtml,
} from "../../../lib/shared/notification.ts";
import { isObject } from "../../../lib/shared/object.ts";
import {
  fromBase64,
  parseQueuedSubmission,
  type SubmissionIds,
} from "../_shared/submission-crypto.ts";

export type FailureCallback = {
  ids: SubmissionIds;
  /** Technical and never personal (blueprint §3), e.g. `mail_failed (HTTP 502)`. */
  reason: string;
};

/** Our own error codes, as `/dispatch-email` answers them. */
const ERROR_CODE = /^[a-z][a-z_]{0,63}$/;

/**
 * QStash's failure callback for a submission `/submit-form` queued; null for
 * any other body. The reason keeps only the last answer's HTTP status and our
 * own error code from it, so nothing else that answer held is kept.
 */
export function parseFailureCallback(text: string): FailureCallback | null {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(body) || typeof body.sourceBody !== "string") return null;

  const source = decodeBase64(body.sourceBody);
  const message = source === null ? null : parseQueuedSubmission(source);
  if (message === null) return null;
  return { ids: message.ids, reason: failureReason(body.status, body.body) };
}

function failureReason(status: unknown, body: unknown): string {
  if (typeof status !== "number" || !Number.isInteger(status) || status <= 0) {
    return "no_response";
  }
  const code = typeof body === "string" ? errorCode(decodeBase64(body)) : null;
  return code === null ? `HTTP ${status}` : `${code} (HTTP ${status})`;
}

function errorCode(text: string | null): string | null {
  if (text === null) return null;
  try {
    const answer: unknown = JSON.parse(text);
    return isObject(answer) &&
      typeof answer.error === "string" &&
      ERROR_CODE.test(answer.error)
      ? answer.error
      : null;
  } catch {
    return null;
  }
}

/** UTF-8 text from base64, as QStash encodes bodies; null if it is not. */
function decodeBase64(text: string): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(fromBase64(text));
  } catch {
    return null;
  }
}

export type FailureAlertContext = {
  formName: string;
  teamName: string;
  ids: SubmissionIds;
  /** Null when the stats row is gone. */
  submittedAt: Date | null;
  reason: string;
};

/**
 * The alert to a team's Team Admins: which form, which submission and why,
 * in the Standard Layout. Metadata only, never the answers. Every inserted
 * value is escaped; the subject is plain text.
 */
export function renderFailureAlert(context: FailureAlertContext): {
  subject: string;
  html: string;
} {
  const table = detailsTable([
    ["Formular", context.formName],
    ["Team", context.teamName],
    ["Version", String(context.ids.version)],
    [
      "Eingegangen am",
      context.submittedAt
        ? formatSubmittedAt(context.submittedAt)
        : "unbekannt",
    ],
    ["Einsendungs-ID", context.ids.submissionId],
    ["Grund", context.reason],
  ]);
  const body = `<h2>Eine Einsendung konnte nicht zugestellt werden</h2>
<p>Die Benachrichtigung zu einer Einsendung des Formulars <strong>${escapeHtml(context.formName)}</strong> konnte auch nach mehreren Versuchen nicht versendet werden.</p>
${table}
<p>Die verschlüsselte Einsendung wird 7 Tage aufbewahrt. Bitte prüfen Sie in dieser Zeit die Empfänger und die E-Mail-Vorlage des Formulars.</p>`;
  return {
    subject: `Zustellung fehlgeschlagen: ${context.formName}`
      .replace(/\s+/g, " ")
      .trim(),
    html: standardLayoutHtml(body),
  };
}

import type { DlqRetry } from "./dead-letter-queue.ts";

/** How long QStash keeps a message in its DLQ (blueprint §4.3). */
export const DLQ_RETENTION_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * Whether a delivery failure can be retried: yes; not any more, because the
 * DLQ's retention is over or a retry found the message gone; or it is
 * queued again after a retry, until it is sent or fails again.
 */
export type RetryAvailability =
  | "available"
  | "expired"
  | "gone"
  | "in_progress";

/** A delivery failure as the *Zustellfehler* view lists it: metadata only. */
export type DeliveryFailure = {
  /** The submission ID. */
  id: string;
  submittedAt: string;
  version: number;
  /** Technical, never personal data (blueprint §3). */
  reason: string | null;
  retry: RetryAvailability;
};

/** The `form_stats` columns the list reads; QStash's message ID is not among them. */
export const DELIVERY_FAILURE_COLUMNS =
  "id, version, status, submitted_at, failure_reason, failed_at, retried_at, dlq_gone_at";

export type DeliveryFailureRow = {
  id: string;
  version: number;
  status: "queued" | "sent" | "failed";
  submitted_at: string;
  failure_reason: string | null;
  failed_at: string | null;
  retried_at: string | null;
  dlq_gone_at: string | null;
};

export function toDeliveryFailure(
  row: DeliveryFailureRow,
  now: Date,
): DeliveryFailure {
  return {
    id: row.id,
    submittedAt: row.submitted_at,
    version: row.version,
    reason: row.failure_reason,
    retry: retryAvailability(row, now),
  };
}

function retryAvailability(
  row: DeliveryFailureRow,
  now: Date,
): RetryAvailability {
  if (row.status !== "failed") return "in_progress";
  if (row.dlq_gone_at !== null) return "gone";
  if (
    row.failed_at === null ||
    now.getTime() - new Date(row.failed_at).getTime() >=
      DLQ_RETENTION_DAYS * DAY_MS
  ) {
    return "expired";
  }
  return "available";
}

export type RetryDeliveryDeps = {
  /** QStash's ID of the submission's failed message; null if it is not failed or was found gone. */
  failedMessageId(submissionId: string): Promise<string | null>;
  retryMessage(messageId: string): Promise<DlqRetry>;
  /** Queues the submission again under the new message, and audits the retry. */
  recordRetry(submissionId: string, messageId: string): Promise<void>;
  /** Marks the submission as no longer retryable. */
  recordGone(submissionId: string, messageId: string): Promise<void>;
};

/**
 * `retried`: queued again, the dispatcher marks it sent or failed as for any
 * delivery. `retried_unrecorded`: queued again, but the database still shows
 * it failed and the audit log lacks it. `gone`: the DLQ no longer holds it.
 * `not_retryable`: not failed (any more), or found gone before.
 */
export type RetryOutcome =
  | "retried"
  | "retried_unrecorded"
  | "gone"
  | "not_retryable";

/**
 * Retries a failed delivery from QStash's DLQ (blueprint §4.5). Throws when
 * QStash or the database fails before the retry; nothing changes then.
 */
export async function retryDelivery(
  submissionId: string,
  deps: RetryDeliveryDeps,
): Promise<RetryOutcome> {
  const message = await deps.failedMessageId(submissionId);
  if (message === null) return "not_retryable";
  const retry = await deps.retryMessage(message);
  if (retry.status === "gone") {
    await deps.recordGone(submissionId, message);
    return "gone";
  }
  try {
    await deps.recordRetry(submissionId, retry.messageId);
  } catch (error) {
    console.error(
      `Retry of ${submissionId} is queued as ${retry.messageId} but could not be recorded`,
      error,
    );
    return "retried_unrecorded";
  }
  return "retried";
}

import { isObject } from "../shared/object.ts";

/** QStash's default address, its EU region (ADR-0002), as the SDK uses it. */
const DEFAULT_QSTASH_URL = "https://qstash.upstash.io";

/** What became of a retry: queued again under a new message, or not in the DLQ any more. */
export type DlqRetry =
  | { status: "retried"; messageId: string }
  | { status: "gone" };

export type DeadLetterQueue = {
  /**
   * Retries the message QStash moved to its DLQ after all retries, by the
   * ID it had when published. QStash queues a copy (same body, headers and
   * failure callback) under a new ID and takes it out of the DLQ.
   */
  retry(messageId: string): Promise<DlqRetry>;
};

/**
 * QStash's DLQ through its REST API, for retrying deliveries from the
 * dashboard (blueprint §4.5). It retries by message ID in one call
 * (`POST /v2/dlq/retry?messageId=`, as the SDK's `dlq.retry({ filter })`),
 * so the dashboard never receives a message's body, not even encrypted
 * (ADR-0002). Throws when QStash cannot be reached or refuses.
 */
export function createDeadLetterQueue({
  token,
  baseUrl = DEFAULT_QSTASH_URL,
  fetch: send = fetch,
}: {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}): DeadLetterQueue {
  const base = baseUrl.replace(/\/+$/, "");

  return {
    async retry(messageId) {
      const response = await send(
        `${base}/v2/dlq/retry?${new URLSearchParams({ messageId, count: "1" })}`,
        { method: "POST", headers: { authorization: `Bearer ${token}` } },
      );
      if (!response.ok) {
        throw new Error(
          `QStash could not retry a DLQ message: HTTP ${response.status}`,
        );
      }
      const answer: unknown = await response.json();
      if (!isObject(answer) || !Array.isArray(answer.responses)) {
        throw new Error("QStash answered a DLQ retry in an unknown shape");
      }
      // Nothing retried: QStash no longer holds the message (retention over,
      // or removed by hand).
      const [retried] = answer.responses;
      if (retried === undefined) return { status: "gone" };
      if (!isObject(retried) || typeof retried.messageId !== "string") {
        throw new Error("QStash retried a DLQ message without a message ID");
      }
      // Within QStash's 10-minute deduplication window nothing is sent. A
      // message reaches the DLQ only after about 30 minutes of retries, so
      // this should never happen; never report it as queued if it does.
      if (retried.deduplicated === true) {
        throw new Error(`QStash deduplicated the retry of ${messageId}`);
      }
      return { status: "retried", messageId: retried.messageId };
    },
  };
}

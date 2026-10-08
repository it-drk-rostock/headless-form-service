import { describe, expect, it } from "vitest";
import {
  type DeliveryFailureRow,
  type RetryDeliveryDeps,
  retryDelivery,
  toDeliveryFailure,
} from "./delivery-failures.ts";

const NOW = new Date("2026-10-08T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

const row = (over: Partial<DeliveryFailureRow> = {}): DeliveryFailureRow => ({
  id: "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d",
  version: 3,
  status: "failed",
  submitted_at: daysAgo(2),
  failure_reason: "mail_failed (HTTP 502)",
  failed_at: daysAgo(1),
  retried_at: null,
  dlq_gone_at: null,
  ...over,
});

describe("a delivery failure as the list shows it", () => {
  it("carries the submission time, version and reason, never more", () => {
    expect(toDeliveryFailure(row(), NOW)).toEqual({
      id: "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d",
      submittedAt: daysAgo(2),
      version: 3,
      reason: "mail_failed (HTTP 502)",
      retry: "available",
    });
  });

  it("can be retried for 7 days after it failed", () => {
    expect(toDeliveryFailure(row({ failed_at: daysAgo(6.9) }), NOW).retry).toBe(
      "available",
    );
    expect(toDeliveryFailure(row({ failed_at: daysAgo(7) }), NOW).retry).toBe(
      "expired",
    );
  });

  it("cannot be retried once a retry found its message gone", () => {
    expect(
      toDeliveryFailure(row({ dlq_gone_at: daysAgo(0.5) }), NOW).retry,
    ).toBe("gone");
  });

  it("cannot be retried without a failure time", () => {
    expect(toDeliveryFailure(row({ failed_at: null }), NOW).retry).toBe(
      "expired",
    );
  });

  it("is being retried while queued again", () => {
    expect(
      toDeliveryFailure(
        row({ status: "queued", retried_at: daysAgo(0.01) }),
        NOW,
      ).retry,
    ).toBe("in_progress");
  });

  it("has no reason to show when none was recorded", () => {
    expect(toDeliveryFailure(row({ failure_reason: null }), NOW).reason).toBe(
      null,
    );
  });
});

const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";

function fakes(over: Partial<RetryDeliveryDeps> = {}) {
  const calls: string[] = [];
  const deps: RetryDeliveryDeps = {
    failedMessageId: async (id) => {
      calls.push(`failedMessage ${id}`);
      return "msg_1";
    },
    retryMessage: async (message) => {
      calls.push(`retryMessage ${message}`);
      return { status: "retried", messageId: "msg_2" };
    },
    recordRetry: async (id, message) => {
      calls.push(`recordRetry ${id} ${message}`);
    },
    recordGone: async (id, message) => {
      calls.push(`recordGone ${id} ${message}`);
    },
    ...over,
  };
  return { deps, calls };
}

describe("retrying a delivery", () => {
  it("retries the failed message from the DLQ and records the new one", async () => {
    const { deps, calls } = fakes();
    expect(await retryDelivery(SUBMISSION, deps)).toBe("retried");
    expect(calls).toEqual([
      `failedMessage ${SUBMISSION}`,
      "retryMessage msg_1",
      `recordRetry ${SUBMISSION} msg_2`,
    ]);
  });

  it("records that the message is gone, so it is not offered again", async () => {
    const { deps, calls } = fakes({
      retryMessage: async () => ({ status: "gone" }),
    });
    expect(await retryDelivery(SUBMISSION, deps)).toBe("gone");
    expect(calls).toEqual([
      `failedMessage ${SUBMISSION}`,
      `recordGone ${SUBMISSION} msg_1`,
    ]);
  });

  it("says so when the retry is out but could not be recorded", async () => {
    const { deps } = fakes({
      recordRetry: async () => {
        throw new Error("database down");
      },
    });
    expect(await retryDelivery(SUBMISSION, deps)).toBe("retried_unrecorded");
  });

  it("fails without touching anything when QStash fails", async () => {
    const { deps, calls } = fakes({
      retryMessage: async () => {
        throw new Error("QStash could not list its DLQ: HTTP 500");
      },
    });
    await expect(retryDelivery(SUBMISSION, deps)).rejects.toThrow(/QStash/);
    expect(calls).toEqual([`failedMessage ${SUBMISSION}`]);
  });

  it("does not ask QStash when the submission cannot be retried", async () => {
    const { deps, calls } = fakes({
      failedMessageId: async (id) => {
        calls.push(`failedMessage ${id}`);
        return null;
      },
    });
    expect(await retryDelivery(SUBMISSION, deps)).toBe("not_retryable");
    expect(calls).toEqual([`failedMessage ${SUBMISSION}`]);
  });

  it("fails before asking QStash when the database fails", async () => {
    const { deps, calls } = fakes({
      failedMessageId: async () => {
        throw new Error("database down");
      },
    });
    await expect(retryDelivery(SUBMISSION, deps)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

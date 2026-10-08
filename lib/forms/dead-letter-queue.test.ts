import { describe, expect, it } from "vitest";
import { createDeadLetterQueue } from "./dead-letter-queue.ts";

type Call = { method: string; url: string; authorization: string | null };

/** QStash answering every request with `answer`, recording the calls. */
function fakeQStash(answer: () => Response): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    fetch: async (input, init) => {
      calls.push({
        method: init?.method ?? "GET",
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
      });
      return answer();
    },
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

describe("retrying a message from the DLQ", () => {
  it("retries the message by its ID, returning the new message's ID", async () => {
    const qstash = fakeQStash(() =>
      json({ responses: [{ messageId: "msg_2" }] }),
    );
    const dlq = createDeadLetterQueue({
      token: "token",
      baseUrl: "https://qstash-eu.example/",
      fetch: qstash.fetch,
    });

    expect(await dlq.retry("msg_1")).toEqual({
      status: "retried",
      messageId: "msg_2",
    });
    expect(qstash.calls).toEqual([
      {
        method: "POST",
        url: "https://qstash-eu.example/v2/dlq/retry?messageId=msg_1&count=1",
        authorization: "Bearer token",
      },
    ]);
  });

  it("reports the message gone when the DLQ no longer holds it", async () => {
    const qstash = fakeQStash(() => json({ responses: [] }));
    const dlq = createDeadLetterQueue({ token: "t", fetch: qstash.fetch });
    expect(await dlq.retry("msg_1")).toEqual({ status: "gone" });
  });

  it("uses QStash's default (EU) address without one", async () => {
    const qstash = fakeQStash(() => json({ responses: [] }));
    await createDeadLetterQueue({ token: "t", fetch: qstash.fetch }).retry(
      "msg/1",
    );
    expect(qstash.calls[0].url).toBe(
      "https://qstash.upstash.io/v2/dlq/retry?messageId=msg%2F1&count=1",
    );
  });

  it("fails when QStash refuses or answers oddly", async () => {
    for (const answer of [
      () => json({ error: "unauthorized" }, 401),
      () => json({ error: "boom" }, 500),
      () => json({ nothing: true }),
      () => json({ responses: [{}] }),
    ]) {
      const dlq = createDeadLetterQueue({
        token: "t",
        fetch: fakeQStash(answer).fetch,
      });
      await expect(dlq.retry("msg_1")).rejects.toThrow(/QStash/);
    }
  });

  it("fails rather than report a retry QStash deduplicated, which sends nothing", async () => {
    const dlq = createDeadLetterQueue({
      token: "t",
      fetch: fakeQStash(() =>
        json({ responses: [{ messageId: "msg_1", deduplicated: true }] }),
      ).fetch,
    });
    await expect(dlq.retry("msg_1")).rejects.toThrow(/deduplicated/);
  });
});

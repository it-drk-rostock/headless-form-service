import { beforeAll, describe, expect, it } from "vitest";
import {
  decryptSubmission,
  encryptSubmission,
  parseEncryptionKeys,
  type SubmissionKeys,
} from "../_shared/submission-crypto.ts";
import {
  handleSubmitForm,
  type PublishRequest,
  type SubmitFormDeps,
  type SubmittedForm,
} from "./handler.ts";

const ORIGIN = "https://www.drk-rostock.de";
const FORM = "3f6c1a52-8d0e-4b7a-9c1d-2e5f8a9b0c1d";
const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";
const SCHEMA = {
  pages: [
    {
      name: "seite1",
      elements: [
        { type: "text", name: "vorname" },
        { type: "text", name: "email" },
      ],
    },
  ],
};

let keys: SubmissionKeys;
beforeAll(async () => {
  keys = await parseEncryptionKeys(
    "test:q0NrH1tZr0b2jXg6v7m3o4P0cF8sW2yLkV9eRzT1uYI=",
  );
});

/**
 * In-memory fakes: version 2 of one public form, the `form_stats` rows, and
 * the messages QStash accepted.
 */
function fakes(
  versions: Record<string, SubmittedForm> = {
    [`${FORM}/2`]: { schema: SCHEMA, accessType: "public" },
  },
) {
  const stats = new Map<string, { formId: string; version: number }>();
  const messageIds = new Map<string, string>();
  const published: PublishRequest[] = [];
  const deps: SubmitFormDeps = {
    allowedOrigins: async () => [ORIGIN],
    loadVersion: async (formId, version) =>
      versions[`${formId}/${version}`] ?? null,
    // Like `queue_submission`: false only once QStash's message ID is kept.
    queue: async ({ submissionId, formId, version }) => {
      if (messageIds.has(submissionId)) return false;
      stats.set(submissionId, { formId, version });
      return true;
    },
    unqueue: async (submissionId) => {
      stats.delete(submissionId);
    },
    recordMessage: async (submissionId, messageId) => {
      messageIds.set(submissionId, messageId);
    },
    encrypt: (ids, payload) => encryptSubmission(keys, ids, payload),
    publish: async (request) => {
      published.push(request);
      return { messageId: `msg_${published.length}` };
    },
  };
  return { deps, stats, messageIds, published };
}

const body = (overrides: Record<string, unknown> = {}) => ({
  form_id: FORM,
  version: 2,
  submission_id: SUBMISSION,
  answers: { vorname: "Erika", email: "erika@example.org" },
  ...overrides,
});

const post = (
  payload: unknown,
  init: RequestInit & { origin?: string | null } = {},
) => {
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin) headers.set("origin", origin);
  headers.set("content-type", "application/json");
  return new Request("https://example.test/submit-form", {
    method: "POST",
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
    ...init,
    headers,
  });
};

/** The answers inside a published message, decrypted as the dispatcher will. */
async function decrypted(request: PublishRequest) {
  const { submission_id, form_id, version, encrypted } = request.body;
  return decryptSubmission(
    keys,
    { submissionId: submission_id, formId: form_id, version },
    encrypted,
  );
}

describe("handleSubmitForm", () => {
  it("accepts a submission: queued, encrypted, published once", async () => {
    const { deps, stats, messageIds, published } = fakes();

    const response = await handleSubmitForm(post(body()), deps);

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "accepted" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(stats.get(SUBMISSION)).toEqual({ formId: FORM, version: 2 });
    expect(messageIds.get(SUBMISSION)).toBe("msg_1");
    expect(published).toHaveLength(1);
    expect(await decrypted(published[0])).toEqual({
      answers: { vorname: "Erika", email: "erika@example.org" },
      pass_id: null,
    });
  });

  it("publishes only ciphertext and IDs, deduplicated by the submission ID, with 3 retries", async () => {
    const { deps, published } = fakes();

    await handleSubmitForm(post(body()), deps);

    const [request] = published;
    expect(request.deduplicationId).toBe(SUBMISSION);
    expect(request.retries).toBe(3);
    expect(Object.keys(request.body).sort()).toEqual([
      "encrypted",
      "form_id",
      "submission_id",
      "version",
    ]);
    expect(request.body).toMatchObject({
      submission_id: SUBMISSION,
      form_id: FORM,
      version: 2,
    });
    const message = JSON.stringify(request);
    expect(message).not.toContain("Erika");
    expect(message).not.toContain("erika@example.org");
  });

  it("drops answers to keys that are not questions of the version", async () => {
    const { deps, published } = fakes();

    const response = await handleSubmitForm(
      post(
        body({
          answers: { vorname: "Erika", isAdmin: true, nachname: "Muster" },
        }),
      ),
      deps,
    );

    expect(response.status).toBe(202);
    expect(await decrypted(published[0])).toEqual({
      answers: { vorname: "Erika" },
      pass_id: null,
    });
  });

  it("answers 503 and removes the stats row when publishing fails", async () => {
    const { deps, stats, messageIds } = fakes();
    deps.publish = async () => {
      throw new Error("QStash unavailable");
    };

    const response = await handleSubmitForm(post(body()), deps);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "queue_unavailable" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(stats.size).toBe(0);
    expect(messageIds.size).toBe(0);
  });

  it("can be sent again with the same submission ID after publishing failed", async () => {
    const { deps, published } = fakes();
    const publish = deps.publish;
    deps.publish = async () => {
      throw new Error("QStash unavailable");
    };
    await handleSubmitForm(post(body()), deps);
    deps.publish = publish;

    const response = await handleSubmitForm(post(body()), deps);

    expect(response.status).toBe(202);
    expect(published).toHaveLength(1);
  });

  it.each([
    ["an unknown version", body({ version: 3 })],
    [
      "an unknown form",
      body({ form_id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" }),
    ],
  ])("answers 404 for %s, without queueing", async (_, payload) => {
    const { deps, stats, published } = fakes();

    const response = await handleSubmitForm(post(payload), deps);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "form_not_found" });
    expect(stats.size).toBe(0);
    expect(published).toEqual([]);
  });

  it("publishes a retry again when the stats row could not be removed", async () => {
    const { deps, stats, published } = fakes();
    const publish = deps.publish;
    deps.publish = async () => {
      throw new Error("QStash unavailable");
    };
    deps.unqueue = async () => {
      throw new Error("connection refused");
    };
    expect((await handleSubmitForm(post(body()), deps)).status).toBe(503);
    expect(stats.has(SUBMISSION)).toBe(true);
    deps.publish = publish;

    const response = await handleSubmitForm(post(body()), deps);

    expect(response.status).toBe(202);
    expect(published).toHaveLength(1);
    expect(published[0].deduplicationId).toBe(SUBMISSION);
  });

  it("does not queue a submission ID twice", async () => {
    const { deps, published } = fakes();
    await handleSubmitForm(post(body()), deps);

    const response = await handleSubmitForm(post(body()), deps);

    expect(response.status).toBe(202);
    expect(published).toHaveLength(1);
  });

  it("refuses protected forms until form passes are claimed", async () => {
    const { deps, stats, published } = fakes({
      [`${FORM}/2`]: { schema: SCHEMA, accessType: "protected" },
    });

    const response = await handleSubmitForm(post(body()), deps);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "form_pass_invalid" });
    expect(stats.size).toBe(0);
    expect(published).toEqual([]);
  });

  it.each([
    ["no JSON", "vorname=Erika"],
    ["an array", [body()]],
    ["a form ID that is not a UUID", body({ form_id: "kursanmeldung" })],
    ["a version that is not a positive integer", body({ version: 1.5 })],
    ["a version given as text", body({ version: "2" })],
    ["no submission ID", body({ submission_id: undefined })],
    ["a submission ID that is not a UUID", body({ submission_id: "1" })],
    ["answers that are not an object", body({ answers: ["Erika"] })],
    ["no answers", body({ answers: undefined })],
  ])("answers 400 for %s", async (_, payload) => {
    const { deps, stats, published } = fakes();

    const response = await handleSubmitForm(post(payload), deps);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "request_invalid" });
    expect(stats.size).toBe(0);
    expect(published).toEqual([]);
  });

  it("refuses other origins before reading the request", async () => {
    const { deps, stats, published } = fakes();

    const response = await handleSubmitForm(
      post(body(), { origin: "https://evil.example" }),
      deps,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_not_allowed" });
    expect(stats.size).toBe(0);
    expect(published).toEqual([]);
  });

  it("answers the preflight of an allowed origin", async () => {
    const { deps } = fakes();

    const response = await handleSubmitForm(
      new Request("https://example.test/submit-form", {
        method: "OPTIONS",
        headers: { origin: ORIGIN },
      }),
      deps,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "content-type",
    );
  });

  it("rejects other methods with 405 and an Allow header", async () => {
    const { deps } = fakes();

    const response = await handleSubmitForm(
      new Request("https://example.test/submit-form", {
        headers: { origin: ORIGIN },
      }),
      deps,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
  });

  it("still accepts the submission when QStash's message ID cannot be kept", async () => {
    const { deps, stats } = fakes();
    deps.recordMessage = async () => {
      throw new Error("connection refused");
    };

    const response = await handleSubmitForm(post(body()), deps);

    expect(response.status).toBe(202);
    expect(stats.has(SUBMISSION)).toBe(true);
  });

  it("answers 500 with CORS headers when the database fails, without publishing", async () => {
    const { deps, published } = fakes();
    deps.queue = async () => {
      throw new Error("connection refused");
    };

    const response = await handleSubmitForm(post(body()), deps);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(published).toEqual([]);
  });
});

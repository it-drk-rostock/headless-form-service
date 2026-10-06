import { beforeAll, describe, expect, it } from "vitest";
import type { Mail } from "../_shared/mailjet.ts";
import {
  decryptSubmission,
  encryptSubmission,
  parseEncryptionKeys,
  type QueuedSubmission,
  type SubmissionKeys,
} from "../_shared/submission-crypto.ts";
import {
  type DispatchEmailDeps,
  type DispatchedSubmission,
  handleDispatchEmail,
} from "./handler.ts";

const FORM = "3f6c1a52-8d0e-4b7a-9c1d-2e5f8a9b0c1d";
const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";
const SIGNATURE = "valid-signature";
const SENDER = { email: "formulare@drk-rostock.de", name: "DRK Rostock" };
const SCHEMA = {
  pages: [
    {
      name: "seite1",
      elements: [{ type: "text", name: "vorname", title: "Vorname" }],
    },
  ],
};
const TEMPLATE = {
  mode: "standard",
  subject: "Neue Einsendung: {{form.name}}",
  body: "<p>Eingang am {{submitted_at}}</p>{{answers_table}}",
};

let keys: SubmissionKeys;
beforeAll(async () => {
  keys = await parseEncryptionKeys(
    "test:q0NrH1tZr0b2jXg6v7m3o4P0cF8sW2yLkV9eRzT1uYI=",
  );
});

const ids = { submissionId: SUBMISSION, formId: FORM, version: 2 };

/** A QStash message as `/submit-form` publishes it. */
async function message(
  answers: Record<string, unknown> = { vorname: "<b>Erika</b>" },
): Promise<QueuedSubmission> {
  return {
    submission_id: SUBMISSION,
    form_id: FORM,
    version: 2,
    encrypted: await encryptSubmission(keys, ids, { answers, pass_id: null }),
  };
}

/** In-memory fakes: one queued submission, a mailer, the stats status. */
function fakes(overrides: Partial<DispatchedSubmission> = {}) {
  const submission: DispatchedSubmission = {
    formName: "Kursanmeldung",
    recipients: ["kurse@drk-rostock.de", "leitung@drk-rostock.de"],
    template: TEMPLATE,
    schema: SCHEMA,
    submittedAt: new Date("2026-10-06T12:30:00Z"),
    status: "queued",
    ...overrides,
  };
  const sent: Mail[] = [];
  const statuses = new Map<string, string>();
  const deps: DispatchEmailDeps = {
    verifySignature: async (signature) => signature === SIGNATURE,
    decrypt: (ids, envelope) => decryptSubmission(keys, ids, envelope),
    loadSubmission: async (requested) =>
      requested.submissionId === SUBMISSION &&
      requested.formId === FORM &&
      requested.version === 2
        ? submission
        : null,
    send: async (mail) => {
      sent.push(mail);
    },
    markSent: async (submissionId) => {
      statuses.set(submissionId, "sent");
    },
    sender: SENDER,
  };
  return { deps, sent, statuses };
}

const deliver = (
  payload: unknown,
  { signature = SIGNATURE, method = "POST" } = {},
) => {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature) headers.set("upstash-signature", signature);
  return new Request("https://example.test/dispatch-email", {
    method,
    headers,
    body:
      method === "GET"
        ? undefined
        : typeof payload === "string"
          ? payload
          : JSON.stringify(payload),
  });
};

describe("handleDispatchEmail", () => {
  it("sends the rendered notification email to the form's recipients from the sender", async () => {
    const { deps, sent } = fakes();

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent" });
    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail.from).toEqual(SENDER);
    expect(mail.to).toEqual(["kurse@drk-rostock.de", "leitung@drk-rostock.de"]);
    expect(mail.subject).toBe("Neue Einsendung: Kursanmeldung");
    expect(mail.html).toContain("<p>Eingang am 06.10.2026, 14:30</p>");
    expect(mail.html).toContain("Vorname");
    expect(mail.html).toContain("&lt;b&gt;Erika&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Erika</b>");
    expect(mail.customId).toBe(SUBMISSION);
  });

  it("marks the submission sent", async () => {
    const { deps, statuses } = fakes();

    await handleDispatchEmail(deliver(await message()), deps);

    expect(statuses.get(SUBMISSION)).toBe("sent");
  });

  it.each([
    ["no signature", ""],
    ["a wrong signature", "forged"],
  ])("rejects a request with %s, without sending", async (_, signature) => {
    const { deps, sent, statuses } = fakes();

    const response = await handleDispatchEmail(
      deliver(await message(), { signature }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "signature_invalid" });
    expect(sent).toEqual([]);
    expect(statuses.size).toBe(0);
  });

  it("verifies the signature against the exact body QStash signed", async () => {
    const { deps } = fakes();
    const bodies: string[] = [];
    deps.verifySignature = async (_, body) => {
      bodies.push(body);
      return true;
    };
    const text = JSON.stringify(await message());

    await handleDispatchEmail(deliver(text), deps);

    expect(bodies).toEqual([text]);
  });

  it("does not send a second email for a submission already sent", async () => {
    const { deps, sent } = fakes({ status: "sent" });

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent" });
    expect(sent).toEqual([]);
  });

  it("answers 200 for a submission already sent even when it can no longer be decrypted", async () => {
    const { deps, sent } = fakes({ status: "sent" });
    deps.decrypt = async () => {
      throw new Error("unknown submission key k0");
    };

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(200);
    expect(sent).toEqual([]);
  });

  it("sends a submission whose stats row is missing", async () => {
    const { deps, sent, statuses } = fakes({ status: null });

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(statuses.get(SUBMISSION)).toBe("sent");
  });

  it("answers 502 so QStash retries when Mailjet fails, leaving the row queued", async () => {
    const { deps, statuses } = fakes();
    deps.send = async () => {
      throw new Error("Mailjet answered 503");
    };

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "mail_failed" });
    expect(statuses.size).toBe(0);
  });

  it("still answers 200 when the row cannot be marked sent, so the email is not sent twice", async () => {
    const { deps, sent } = fakes();
    deps.markSent = async () => {
      throw new Error("connection refused");
    };

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
  });

  it("answers 404 for a form version that no longer exists", async () => {
    const { deps, sent } = fakes();
    deps.loadSubmission = async () => null;

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "form_not_found" });
    expect(sent).toEqual([]);
  });

  it("answers 422 for a form without recipients", async () => {
    const { deps, sent } = fakes({ recipients: [] });

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "no_recipients" });
    expect(sent).toEqual([]);
  });

  it("answers 422 for a version whose email template cannot be read", async () => {
    const { deps, sent } = fakes({ template: {} });

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "template_invalid" });
    expect(sent).toEqual([]);
  });

  it("answers 422 for a ciphertext that does not belong to the message", async () => {
    const { deps, sent } = fakes();
    // Encrypted for another submission, then put into this one's message.
    const moved = {
      ...(await message()),
      encrypted: await encryptSubmission(
        keys,
        { ...ids, submissionId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" },
        { answers: { vorname: "Erika" }, pass_id: null },
      ),
    };

    const response = await handleDispatchEmail(deliver(moved), deps);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "submission_unreadable" });
    expect(sent).toEqual([]);
  });

  it.each([
    ["no JSON", "x"],
    [
      "no encrypted part",
      { submission_id: SUBMISSION, form_id: FORM, version: 2 },
    ],
    [
      "an envelope of another format",
      {
        submission_id: SUBMISSION,
        form_id: FORM,
        version: 2,
        encrypted: { v: 2, kid: "k", iv: "", ct: "" },
      },
    ],
    [
      "a submission ID that is not a UUID",
      {
        submission_id: "1",
        form_id: FORM,
        version: 2,
        encrypted: { v: 1, kid: "k", iv: "", ct: "" },
      },
    ],
  ])("answers 400 for %s", async (_, payload) => {
    const { deps, sent } = fakes();

    const response = await handleDispatchEmail(deliver(payload), deps);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "request_invalid" });
    expect(sent).toEqual([]);
  });

  it("rejects other methods with 405", async () => {
    const { deps } = fakes();

    const response = await handleDispatchEmail(
      deliver(null, { method: "GET" }),
      deps,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("answers 500 when the database fails, without sending", async () => {
    const { deps, sent } = fakes();
    deps.loadSubmission = async () => {
      throw new Error("connection refused");
    };

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
    expect(sent).toEqual([]);
  });
});

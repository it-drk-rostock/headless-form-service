import { beforeAll, describe, expect, it } from "vitest";
import type { PassMetadata } from "../../../lib/shared/form-pass.ts";
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
  type RecordedFailure,
} from "./handler.ts";

const FORM = "3f6c1a52-8d0e-4b7a-9c1d-2e5f8a9b0c1d";
const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";
const PASS = "7d2e4f6a-1b3c-4d5e-8f9a-0b1c2d3e4f5a";
const SIGNATURE = "valid-signature";
const SENDER_EMAIL = "formulare@drk-rostock.de";
const SCHEMA = {
  pages: [
    {
      name: "seite1",
      elements: [
        { type: "text", name: "vorname", title: "Vorname" },
        { type: "text", name: "email", inputType: "email", title: "E-Mail" },
      ],
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
  passId: string | null = null,
): Promise<QueuedSubmission> {
  return {
    submission_id: SUBMISSION,
    form_id: FORM,
    version: 2,
    encrypted: await encryptSubmission(keys, ids, { answers, pass_id: passId }),
  };
}

/** In-memory fakes: one queued submission, a mailer, the stats status. */
function fakes(
  overrides: Partial<DispatchedSubmission> = {},
  failureOverrides: Partial<RecordedFailure> = {},
) {
  const submission: DispatchedSubmission = {
    formName: "Kursanmeldung",
    recipients: ["kurse@drk-rostock.de", "leitung@drk-rostock.de"],
    template: TEMPLATE,
    schema: SCHEMA,
    submittedAt: new Date("2026-10-06T12:30:00Z"),
    status: "queued",
    senderDisplayName: "DRK Kurse",
    replyToQuestion: null,
    allowedRecipientDomains: ["drk-rostock.de"],
    ...overrides,
  };
  const sent: Mail[] = [];
  const statuses = new Map<string, string>();
  const passes = new Map<string, PassMetadata>([
    [PASS, { ticket: "T-4711", kampagne: "Herbst <2026>" }],
  ]);
  const passLoads: string[] = [];
  const failures: { submissionId: string; reason: string }[] = [];
  const failure: RecordedFailure = {
    formName: "Kursanmeldung",
    teamName: "Erste Hilfe",
    teamAdmins: ["anna@drk-rostock.de", "ben@drk-rostock.de"],
    submittedAt: new Date("2026-10-06T12:30:00Z"),
    status: "failed",
    ...failureOverrides,
  };
  const deps: DispatchEmailDeps = {
    verifySignature: async (signature) => signature === SIGNATURE,
    decrypt: (ids, envelope) => decryptSubmission(keys, ids, envelope),
    loadSubmission: async (requested) =>
      requested.submissionId === SUBMISSION &&
      requested.formId === FORM &&
      requested.version === 2
        ? submission
        : null,
    loadPassMetadata: async (formId, passId) => {
      passLoads.push(passId);
      return formId === FORM ? (passes.get(passId) ?? null) : null;
    },
    send: async (mail) => {
      sent.push(mail);
    },
    markSent: async (submissionId) => {
      statuses.set(submissionId, "sent");
    },
    recordFailure: async (requested, reason) => {
      if (
        requested.submissionId !== SUBMISSION ||
        requested.formId !== FORM ||
        requested.version !== 2
      ) {
        return null;
      }
      failures.push({ submissionId: requested.submissionId, reason });
      return failure;
    },
    loadPassContext: async () => null,
    senderEmail: SENDER_EMAIL,
  };
  return { deps, sent, statuses, passes, passLoads, failures };
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
    expect(mail.from).toEqual({ email: SENDER_EMAIL, name: "DRK Kurse" });
    expect(mail.to).toEqual(["kurse@drk-rostock.de", "leitung@drk-rostock.de"]);
    expect(mail.subject).toBe("Neue Einsendung: Kursanmeldung");
    expect(mail.html).toContain("<p>Eingang am 06.10.2026, 14:30</p>");
    expect(mail.html).toContain("Vorname");
    expect(mail.html).toContain("&lt;b&gt;Erika&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>Erika</b>");
    expect(mail.customId).toBe(SUBMISSION);
  });

  it("sends from the service's name when the form has no display name", async () => {
    const { deps, sent } = fakes({ senderDisplayName: "" });

    await handleDispatchEmail(deliver(await message()), deps);

    expect(sent[0].from).toEqual({
      email: SENDER_EMAIL,
      name: "DRK Rostock Formular-Service",
    });
  });

  it("sets Reply-To to the answer of the form's Reply-To question", async () => {
    const { deps, sent } = fakes({ replyToQuestion: "email" });

    await handleDispatchEmail(
      deliver(
        await message({ vorname: "Erika", email: " erika@example.org " }),
      ),
      deps,
    );

    expect(sent[0].replyTo).toBe("erika@example.org");
  });

  it.each([
    ["no Reply-To question is set", null, { email: "erika@example.org" }],
    ["the answer is no valid address", "email", { email: "erika@" }],
    ["the question was not answered", "email", { vorname: "Erika" }],
  ])("sets no Reply-To when %s, and still sends", async (_, question, answers) => {
    const { deps, sent } = fakes({ replyToQuestion: question });

    const response = await handleDispatchEmail(
      deliver(await message(answers)),
      deps,
    );

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].replyTo).toBeUndefined();
  });

  it("renders the submitted version's template, answers included", async () => {
    const { deps, sent } = fakes({
      template: {
        mode: "standard",
        subject: "Anmeldung von {{answers.vorname}}",
        body: "<p>Hallo {{answers.vorname}}</p>",
      },
    });

    await handleDispatchEmail(deliver(await message()), deps);

    expect(sent[0].subject).toBe("Anmeldung von <b>Erika</b>");
    expect(sent[0].html).toContain("<p>Hallo &lt;b&gt;Erika&lt;/b&gt;</p>");
  });

  it("fills pass placeholders from the metadata of the claimed form pass", async () => {
    const { deps, sent, passLoads } = fakes({
      template: {
        mode: "standard",
        subject: "Ticket {{pass.ticket}}",
        body: "<p>{{pass.kampagne}} [{{pass.abteilung}}]</p>",
      },
    });

    const response = await handleDispatchEmail(
      deliver(await message(undefined, PASS)),
      deps,
    );

    expect(response.status).toBe(200);
    expect(passLoads).toEqual([PASS]);
    expect(sent[0].subject).toBe("Ticket T-4711");
    // Escaped, and a key the pass lacks is empty.
    expect(sent[0].html).toContain("<p>Herbst &lt;2026&gt; []</p>");
  });

  it("renders pass placeholders empty when the claimed pass is gone", async () => {
    const { deps, sent, passes } = fakes({
      template: { mode: "standard", subject: "[{{pass.ticket}}]", body: "" },
    });
    passes.clear();

    await handleDispatchEmail(deliver(await message(undefined, PASS)), deps);

    expect(sent[0].subject).toBe("[]");
  });

  it("loads no pass for a submission without one", async () => {
    const { deps, sent, passLoads } = fakes({
      template: { mode: "standard", subject: "{{pass.ticket}}", body: "" },
    });

    await handleDispatchEmail(deliver(await message()), deps);

    expect(passLoads).toEqual([]);
    expect(sent[0].subject).toBe("{{pass.ticket}}");
  });

  it("answers 500 without sending when the pass metadata cannot be loaded", async () => {
    const { deps, sent } = fakes();
    deps.loadPassMetadata = async () => {
      throw new Error("connection refused");
    };

    const response = await handleDispatchEmail(
      deliver(await message(undefined, PASS)),
      deps,
    );

    expect(response.status).toBe(500);
    expect(sent).toEqual([]);
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

  it("sends only to recipients on an allowed domain", async () => {
    const { deps, sent } = fakes({
      recipients: ["kurse@drk-rostock.de", "erika@gmail.com"],
    });

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(200);
    expect(sent[0].to).toEqual(["kurse@drk-rostock.de"]);
  });

  it("answers 422 without sending when no recipient is on an allowed domain", async () => {
    const { deps, sent, statuses } = fakes({
      recipients: ["kurse@drk-rostock.de", "erika@gmail.com"],
      allowedRecipientDomains: ["kv.drk-rostock.de"],
    });

    const response = await handleDispatchEmail(deliver(await message()), deps);

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "recipients_not_allowed" });
    expect(sent).toEqual([]);
    expect(statuses.size).toBe(0);
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

/** Base64 of UTF-8 text, as QStash encodes bodies in callbacks. */
function base64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * QStash's failure callback once the retries are used up: the source
 * message, and the last answer `/dispatch-email` gave it.
 */
async function failureCallback({
  status = 502 as number | null,
  body = JSON.stringify({ error: "mail_failed" }) as string | null,
  source = undefined as unknown,
} = {}) {
  return {
    ...(status === null ? {} : { status }),
    header: { "content-type": ["application/json"] },
    ...(body === null ? {} : { body: base64(body) }),
    retried: 3,
    maxRetries: 3,
    dlqId: "1725323658779-0",
    sourceMessageId: "msg_26hZCxZCuWyyTWPmSVBrNB882AMRP1TsgzpygELRcLW",
    url: "https://example.test/dispatch-email",
    method: "POST",
    sourceHeader: { "content-type": ["application/json"] },
    sourceBody: base64(JSON.stringify(source ?? (await message()))),
    createdAt: 1_759_754_400_000,
  };
}

describe("handleDispatchEmail, failure callback", () => {
  it("marks the submission failed with the last answer as the reason", async () => {
    const { deps, failures } = fakes();

    const response = await handleDispatchEmail(
      deliver(await failureCallback()),
      deps,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "failed" });
    expect(failures).toEqual([
      { submissionId: SUBMISSION, reason: "mail_failed (HTTP 502)" },
    ]);
  });

  it("alerts the team's Team Admins from the service's sender, without submission data", async () => {
    const { deps, sent } = fakes();

    await handleDispatchEmail(deliver(await failureCallback()), deps);

    expect(sent).toHaveLength(1);
    const [mail] = sent;
    expect(mail.from).toEqual({
      email: SENDER_EMAIL,
      name: "DRK Rostock Formular-Service",
    });
    expect(mail.to).toEqual(["anna@drk-rostock.de", "ben@drk-rostock.de"]);
    expect(mail.replyTo).toBeUndefined();
    expect(mail.subject).toBe("Zustellung fehlgeschlagen: Kursanmeldung");
    expect(mail.customId).toBe(`failure-${SUBMISSION}`);
    expect(mail.html).toContain("Kursanmeldung");
    expect(mail.html).toContain("Erste Hilfe");
    expect(mail.html).toContain("06.10.2026, 14:30");
    expect(mail.html).toContain(SUBMISSION);
    expect(mail.html).toContain("mail_failed (HTTP 502)");
    // Never the answers: they are not even decrypted.
    expect(mail.html).not.toContain("Erika");
    expect(mail.html).not.toContain("Vorname");
  });

  it("does not decrypt the submission", async () => {
    const { deps } = fakes();
    deps.decrypt = async () => {
      throw new Error("must not decrypt");
    };

    const response = await handleDispatchEmail(
      deliver(await failureCallback()),
      deps,
    );

    expect(response.status).toBe(200);
  });

  it("escapes the form and team names in the alert", async () => {
    const { deps, sent } = fakes(
      {},
      { formName: "<b>Kurse</b>", teamName: "Erste & Hilfe" },
    );

    await handleDispatchEmail(deliver(await failureCallback()), deps);

    expect(sent[0].html).toContain("&lt;b&gt;Kurse&lt;/b&gt;");
    expect(sent[0].html).not.toContain("<b>Kurse</b>");
    expect(sent[0].html).toContain("Erste &amp; Hilfe");
    expect(sent[0].subject).toBe("Zustellung fehlgeschlagen: <b>Kurse</b>");
  });

  it("takes only the error code from the last answer as the reason", async () => {
    const { deps, failures } = fakes();

    await handleDispatchEmail(
      deliver(
        await failureCallback({
          status: 422,
          body: JSON.stringify({ error: "recipients_not_allowed" }),
        }),
      ),
      deps,
    );

    expect(failures[0].reason).toBe("recipients_not_allowed (HTTP 422)");
  });

  it("keeps only the status of an answer that is not one of ours", async () => {
    const { deps, failures } = fakes();

    await handleDispatchEmail(
      deliver(
        await failureCallback({
          status: 546,
          body: '{"error":"Max Mustermann <max@example.com> failed"}',
        }),
      ),
      deps,
    );

    expect(failures[0].reason).toBe("HTTP 546");
  });

  it("records a delivery that got no answer at all", async () => {
    const { deps, failures } = fakes();

    await handleDispatchEmail(
      deliver(await failureCallback({ status: null, body: null })),
      deps,
    );

    expect(failures[0].reason).toBe("no_response");
  });

  it("still alerts when the stats row is gone, with an unknown submission time", async () => {
    const { deps, sent } = fakes({}, { submittedAt: null, status: null });

    const response = await handleDispatchEmail(
      deliver(await failureCallback()),
      deps,
    );

    expect(response.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain("unbekannt");
  });

  it("leaves a submission that was sent after all alone, without an alert", async () => {
    const { deps, sent } = fakes({}, { status: "sent" });

    const response = await handleDispatchEmail(
      deliver(await failureCallback()),
      deps,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "sent" });
    expect(sent).toEqual([]);
  });

  it("answers 200 without an alert when the form is gone", async () => {
    const { deps, sent } = fakes();
    deps.recordFailure = async () => null;

    const response = await handleDispatchEmail(
      deliver(await failureCallback()),
      deps,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "form_not_found" });
    expect(sent).toEqual([]);
  });

  it("answers 200 without an alert for a team without Team Admins", async () => {
    const { deps, sent, failures } = fakes({}, { teamAdmins: [] });

    const response = await handleDispatchEmail(
      deliver(await failureCallback()),
      deps,
    );

    expect(response.status).toBe(200);
    expect(failures).toHaveLength(1);
    expect(sent).toEqual([]);
  });

  it("answers 502 so QStash retries the callback when the alert cannot be sent", async () => {
    const { deps, failures } = fakes();
    deps.send = async () => {
      throw new Error("Mailjet answered 503");
    };

    const response = await handleDispatchEmail(
      deliver(await failureCallback()),
      deps,
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "alert_failed" });
    // Marked all the same; the retry marks it again and sends the alert.
    expect(failures).toHaveLength(1);
  });

  it("answers 500 when the failure cannot be recorded, without an alert", async () => {
    const { deps, sent } = fakes();
    deps.recordFailure = async () => {
      throw new Error("connection refused");
    };

    const response = await handleDispatchEmail(
      deliver(await failureCallback()),
      deps,
    );

    expect(response.status).toBe(500);
    expect(sent).toEqual([]);
  });

  it("rejects a failure callback without a valid signature", async () => {
    const { deps, sent, failures } = fakes();

    const response = await handleDispatchEmail(
      deliver(await failureCallback(), { signature: "forged" }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(failures).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("answers 400 for a callback whose source message is not a queued submission", async () => {
    const { deps, sent, failures } = fakes();

    const response = await handleDispatchEmail(
      deliver(await failureCallback({ source: { hello: "world" } })),
      deps,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "request_invalid" });
    expect(failures).toEqual([]);
    expect(sent).toEqual([]);
  });
});

describe("pass-specific delivery", () => {
  it("uses the stored pass recipient even if the client submits routing fields", async () => {
    const { deps, sent } = fakes({ recipients: [] });
    deps.loadPassContext = async () => ({
      prefill: { email: "max@drk-rostock.de" },
      locked_fields: ["email"],
      recipient: "personal@drk-rostock.de",
    });
    const response = await handleDispatchEmail(
      deliver(
        await message(
          { recipient: "attacker@example.org", vorname: "Max" },
          PASS,
        ),
      ),
      deps,
    );
    expect(response.status).toBe(200);
    expect(sent[0].to).toEqual(["personal@drk-rostock.de"]);
    expect(sent[0].html).toContain("max@drk-rostock.de");
  });
  it("refuses changed locked values again at delivery", async () => {
    const { deps, sent } = fakes();
    deps.loadPassContext = async () => ({
      prefill: { email: "max@drk-rostock.de" },
      locked_fields: ["email"],
      recipient: null,
    });
    const response = await handleDispatchEmail(
      deliver(await message({ email: "attacker@example.org" }, PASS)),
      deps,
    );
    expect(response.status).toBe(422);
    expect(sent).toHaveLength(0);
  });
  it("rechecks allowed domains and never falls back to fixed recipients", async () => {
    const { deps, sent } = fakes();
    deps.loadPassContext = async () => ({
      prefill: {},
      locked_fields: [],
      recipient: "max@elsewhere.example",
    });
    const response = await handleDispatchEmail(
      deliver(await message({}, PASS)),
      deps,
    );
    expect(response.status).toBe(422);
    expect(sent).toHaveLength(0);
  });
});

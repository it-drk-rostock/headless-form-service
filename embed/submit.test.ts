import { describe, expect, it } from "vitest";
import { isUuid } from "../lib/shared/uuid.ts";
import { newSubmissionId, submitForm } from "./submit.ts";

const ENDPOINT = "https://project.supabase.co/functions/v1/submit-form";
const SUBMISSION = {
  formId: "3f6c1a52-8d0e-4b7a-9c1d-2e5f8a9b0c1d",
  version: 3,
  submissionId: "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d",
  answers: { vorname: "Erika" },
  turnstileToken: "token-from-the-widget",
  honeypot: "",
};

/** A `fetch` that records each request and answers with `response`. */
function fakeFetch(response: () => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return response();
  };
  return { fetch, requests };
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("submitForm", () => {
  it("posts form, version, submission ID and answers, and reports 202 as accepted", async () => {
    const { fetch, requests } = fakeFetch(() =>
      json({ status: "accepted" }, 202),
    );

    const result = await submitForm(SUBMISSION, { endpoint: ENDPOINT, fetch });

    expect(result).toEqual({ kind: "accepted" });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(ENDPOINT);
    expect(requests[0].init.method).toBe("POST");
    expect(new Headers(requests[0].init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      form_id: SUBMISSION.formId,
      version: 3,
      submission_id: SUBMISSION.submissionId,
      answers: { vorname: "Erika" },
      turnstile_token: "token-from-the-widget",
      honeypot: "",
    });
  });

  it("sends no Turnstile token for a form without Turnstile, and the honeypot as filled", async () => {
    const { fetch, requests } = fakeFetch(() =>
      json({ status: "accepted" }, 202),
    );

    await submitForm(
      { ...SUBMISSION, turnstileToken: null, honeypot: "spam" },
      { endpoint: ENDPOINT, fetch },
    );

    const sent = JSON.parse(String(requests[0].init.body));
    expect(sent).not.toHaveProperty("turnstile_token");
    expect(sent.honeypot).toBe("spam");
  });

  it("reports a refused Turnstile token as a failed security check", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: "turnstile_invalid" }, 403),
    );

    expect(await submitForm(SUBMISSION, { endpoint: ENDPOINT, fetch })).toEqual(
      { kind: "error", reason: "turnstile_invalid" },
    );
  });

  it("reports a form that no longer takes this version as not found", async () => {
    const { fetch } = fakeFetch(() => json({ error: "form_not_found" }, 404));

    expect(await submitForm(SUBMISSION, { endpoint: ENDPOINT, fetch })).toEqual(
      { kind: "error", reason: "not_found" },
    );
  });

  it("reports a refused form pass as an invalid link", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: "form_pass_invalid" }, 403),
    );

    expect(await submitForm(SUBMISSION, { endpoint: ENDPOINT, fetch })).toEqual(
      { kind: "error", reason: "pass_invalid" },
    );
  });

  it("reports a 429 as too many attempts", async () => {
    const { fetch } = fakeFetch(() => json({ error: "rate_limited" }, 429));

    expect(await submitForm(SUBMISSION, { endpoint: ENDPOINT, fetch })).toEqual(
      { kind: "error", reason: "rate_limited" },
    );
  });

  it.each([
    ["an unavailable queue", () => json({ error: "queue_unavailable" }, 503)],
    [
      "an unavailable Turnstile check",
      () => json({ error: "turnstile_unavailable" }, 503),
    ],
    ["a server error", () => json({ error: "internal_error" }, 500)],
    ["a rejected request", () => json({ error: "request_invalid" }, 400)],
    ["a refused origin", () => json({ error: "origin_not_allowed" }, 403)],
    ["a success that is not 202", () => json({}, 200)],
    [
      "a network error",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ])("reports %s as a failed send", async (_, response) => {
    const { fetch } = fakeFetch(response);

    expect(await submitForm(SUBMISSION, { endpoint: ENDPOINT, fetch })).toEqual(
      { kind: "error", reason: "failed" },
    );
  });
});

describe("newSubmissionId", () => {
  it("makes a random version 4 UUID, which /submit-form accepts", () => {
    const ids = Array.from({ length: 20 }, newSubmissionId);

    for (const id of ids) {
      expect(isUuid(id)).toBe(true);
      expect(id).toMatch(/^.{8}-.{4}-4.{3}-[89ab].{3}-.{12}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});

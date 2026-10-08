import { describe, expect, it } from "vitest";
import { hashFormPassSecret } from "../../../lib/shared/form-pass.ts";
import {
  type GenerateFormPassDeps,
  handleGenerateFormPass,
  type NewFormPass,
} from "./handler.ts";

const KEY = "n8n-test-key-0123456789";
const FORM = "3f6c1a52-8d0e-4b7a-9c1d-2e5f8a9b0c1d";
const PUBLIC_FORM = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const NO_PAGE_FORM = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a";
const PAGE = "https://www.drk-rostock.de/nachbefragung?quelle=n8n";
const NOW = Date.parse("2026-10-08T12:00:00Z");

/** In-memory fakes: a protected form with a form page, one without, and a public one. */
function fakes() {
  const created: NewFormPass[] = [];
  const deps: GenerateFormPassDeps = {
    integrationKey: KEY,
    now: () => NOW,
    createPass: async (pass) => {
      if (pass.formId === PUBLIC_FORM) return "form_not_protected";
      if (pass.formId !== FORM && pass.formId !== NO_PAGE_FORM) {
        return "form_not_found";
      }
      created.push(pass);
      return { pageUrl: pass.formId === FORM ? PAGE : null };
    },
  };
  return { deps, created };
}

function post(
  body: unknown,
  authorization: string | null = `Bearer ${KEY}`,
  method = "POST",
): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request("https://example.test/functions/v1/generate-form-pass", {
    method,
    headers,
    body:
      method === "GET"
        ? undefined
        : typeof body === "string"
          ? body
          : JSON.stringify(body),
  });
}

describe("handleGenerateFormPass", () => {
  it("creates a single-use n8n pass for 48 hours by default and returns its secret, expiry and link", async () => {
    const { deps, created } = fakes();

    const response = await handleGenerateFormPass(
      post({ form_id: FORM }),
      deps,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({
      form_pass: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      expires_at: "2026-10-10T12:00:00.000Z",
      url: `https://www.drk-rostock.de/nachbefragung?quelle=n8n&form_pass=${body.form_pass}`,
    });
    expect(created).toEqual([
      {
        formId: FORM,
        tokenHash: await hashFormPassSecret(body.form_pass),
        maxUses: 1,
        expiresAt: "2026-10-10T12:00:00.000Z",
        metadata: {},
      },
    ]);
  });

  it("takes a use limit, an expiry and metadata", async () => {
    const { deps, created } = fakes();

    const response = await handleGenerateFormPass(
      post({
        form_id: FORM,
        max_uses: 5,
        expires_in_hours: 2,
        metadata: { ticket: "T-4711", kampagne: 2026 },
      }),
      deps,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).expires_at).toBe("2026-10-08T14:00:00.000Z");
    expect(created).toMatchObject([
      {
        maxUses: 5,
        expiresAt: "2026-10-08T14:00:00.000Z",
        metadata: { ticket: "T-4711", kampagne: 2026 },
      },
    ]);
  });

  it("creates an unlimited pass for a null use limit", async () => {
    const { deps, created } = fakes();

    const response = await handleGenerateFormPass(
      post({ form_id: FORM, max_uses: null }),
      deps,
    );

    expect(response.status).toBe(201);
    expect(created).toMatchObject([{ maxUses: null }]);
  });

  it("returns no link when the form has no form page", async () => {
    const { deps } = fakes();

    const response = await handleGenerateFormPass(
      post({ form_id: NO_PAGE_FORM }),
      deps,
    );

    expect(response.status).toBe(201);
    expect(Object.keys(await response.json()).sort()).toEqual([
      "expires_at",
      "form_pass",
    ]);
  });

  it("makes a new secret for every pass", async () => {
    const { deps, created } = fakes();

    await handleGenerateFormPass(post({ form_id: FORM }), deps);
    await handleGenerateFormPass(post({ form_id: FORM }), deps);

    expect(created[0].tokenHash).not.toBe(created[1].tokenHash);
  });

  it.each([
    ["no Authorization header", null],
    ["a wrong key", "Bearer n8n-test-key-0123456780"],
    ["a prefix of the key", "Bearer n8n-test-key"],
    ["the key without Bearer", KEY],
    ["another scheme", `Basic ${KEY}`],
    ["an empty Bearer", "Bearer "],
  ])("refuses %s with 401 and creates nothing", async (_, authorization) => {
    const { deps, created } = fakes();

    const response = await handleGenerateFormPass(
      post({ form_id: FORM }, authorization),
      deps,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(created).toEqual([]);
  });

  it("accepts the scheme in any case", async () => {
    const { deps } = fakes();

    const response = await handleGenerateFormPass(
      post({ form_id: FORM }, `bearer ${KEY}`),
      deps,
    );

    expect(response.status).toBe(201);
  });

  it("checks the key before reading the body", async () => {
    const { deps } = fakes();

    const response = await handleGenerateFormPass(
      post("kein json", "Bearer falsch"),
      deps,
    );

    expect(response.status).toBe(401);
  });

  it("refuses a public form with 409 and creates nothing", async () => {
    const { deps, created } = fakes();

    const response = await handleGenerateFormPass(
      post({ form_id: PUBLIC_FORM }),
      deps,
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "form_not_protected" });
    expect(created).toEqual([]);
  });

  it("refuses an unknown form with 404", async () => {
    const { deps } = fakes();

    const response = await handleGenerateFormPass(
      post({ form_id: "00000000-0000-4000-8000-000000000000" }),
      deps,
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "form_not_found" });
  });

  it.each([
    ["not JSON", "{", undefined],
    ["not an object", [FORM], undefined],
    ["no form ID", {}, "form_id"],
    ["a form ID that is no UUID", { form_id: "abc" }, "form_id"],
    ["a use limit of 0", { form_id: FORM, max_uses: 0 }, "max_uses"],
    ["a fractional use limit", { form_id: FORM, max_uses: 1.5 }, "max_uses"],
    ["a use limit as text", { form_id: FORM, max_uses: "1" }, "max_uses"],
    ["a use limit over 10000", { form_id: FORM, max_uses: 10001 }, "max_uses"],
    [
      "an expiry of 0 hours",
      { form_id: FORM, expires_in_hours: 0 },
      "expires_in_hours",
    ],
    [
      "no expiry",
      { form_id: FORM, expires_in_hours: null },
      "expires_in_hours",
    ],
    [
      "an expiry over a year",
      { form_id: FORM, expires_in_hours: 8761 },
      "expires_in_hours",
    ],
    ["metadata that is a list", { form_id: FORM, metadata: [] }, "metadata"],
    [
      "nested metadata",
      { form_id: FORM, metadata: { a: { b: 1 } } },
      "metadata",
    ],
    [
      "a metadata key with a space",
      { form_id: FORM, metadata: { "mit leer": "x" } },
      "metadata",
    ],
    [
      "a metadata value over 500 characters",
      { form_id: FORM, metadata: { ticket: "x".repeat(501) } },
      "metadata",
    ],
    ["an unknown field", { form_id: FORM, expires_hours: 2 }, "expires_hours"],
  ])("refuses %s with 400", async (_, body, field) => {
    const { deps, created } = fakes();

    const response = await handleGenerateFormPass(post(body), deps);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(
      field === undefined
        ? { error: "request_invalid" }
        : { error: "request_invalid", field },
    );
    expect(created).toEqual([]);
  });

  it("allows only POST", async () => {
    const { deps } = fakes();

    const response = await handleGenerateFormPass(
      post(undefined, `Bearer ${KEY}`, "GET"),
      deps,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("answers 500 when the pass cannot be stored", async () => {
    const { deps } = fakes();
    deps.createPass = async () => {
      throw new Error("database down");
    };

    const response = await handleGenerateFormPass(
      post({ form_id: FORM }),
      deps,
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
  });
});

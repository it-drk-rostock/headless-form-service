import { describe, expect, it } from "vitest";
import { loadForm } from "./load.ts";

const ENDPOINT = "https://project.supabase.co/functions/v1/load-form";
const FORM = "3f6c1a52-8d0e-4b7a-9c1d-2e5f8a9b0c1d";
const SCHEMA = {
  pages: [{ name: "seite1", elements: [{ type: "text", name: "vorname" }] }],
};

/** A `fetch` that records the requested URL and answers with `response`. */
function fakeFetch(response: () => Response | Promise<Response>) {
  const requested: string[] = [];
  const fetch = async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return response();
  };
  return { fetch, requested };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("loadForm", () => {
  it("asks /load-form for the form and returns its current version", async () => {
    const { fetch, requested } = fakeFetch(() =>
      json({ version: 3, schema: SCHEMA, access_type: "public" }),
    );

    const result = await loadForm(FORM, { endpoint: ENDPOINT, fetch });

    expect(result).toEqual({
      kind: "ready",
      version: 3,
      schema: SCHEMA,
      turnstileSiteKey: null,
    });
    expect(requested).toEqual([`${ENDPOINT}?form_id=${FORM}`]);
  });

  it("returns the Turnstile site key of a form with Turnstile on", async () => {
    const { fetch } = fakeFetch(() =>
      json({
        version: 3,
        schema: SCHEMA,
        access_type: "public",
        turnstile_site_key: "0x4AAAAAAAtestsitekey",
      }),
    );

    expect(await loadForm(FORM, { endpoint: ENDPOINT, fetch })).toEqual({
      kind: "ready",
      version: 3,
      schema: SCHEMA,
      turnstileSiteKey: "0x4AAAAAAAtestsitekey",
    });
  });

  it("encodes the form ID taken from the page", async () => {
    const { fetch, requested } = fakeFetch(() =>
      json({ error: "form_not_found" }, 404),
    );

    await loadForm("a&b=c", { endpoint: ENDPOINT, fetch });

    expect(requested).toEqual([`${ENDPOINT}?form_id=a%26b%3Dc`]);
  });

  it("reports an unknown, unpublished or archived form as not found", async () => {
    const { fetch } = fakeFetch(() => json({ error: "form_not_found" }, 404));

    expect(await loadForm(FORM, { endpoint: ENDPOINT, fetch })).toEqual({
      kind: "error",
      reason: "not_found",
    });
  });

  it("reports a missing form ID as not found without asking", async () => {
    const { fetch, requested } = fakeFetch(() => json({}));

    expect(await loadForm("  ", { endpoint: ENDPOINT, fetch })).toEqual({
      kind: "error",
      reason: "not_found",
    });
    expect(requested).toEqual([]);
  });

  it("reports a refused form pass as an invalid link", async () => {
    const { fetch } = fakeFetch(() =>
      json({ error: "form_pass_invalid" }, 403),
    );

    expect(await loadForm(FORM, { endpoint: ENDPOINT, fetch })).toEqual({
      kind: "error",
      reason: "pass_invalid",
    });
  });

  it("reports a 429 as too many attempts", async () => {
    const { fetch } = fakeFetch(() => json({ error: "rate_limited" }, 429));

    expect(await loadForm(FORM, { endpoint: ENDPOINT, fetch })).toEqual({
      kind: "error",
      reason: "rate_limited",
    });
  });

  it.each([
    ["a server error", () => json({ error: "internal_error" }, 500)],
    ["a refused origin", () => json({ error: "origin_not_allowed" }, 403)],
    ["a body that is not JSON", () => new Response("<html>", { status: 200 })],
    ["a body without questions", () => json({ version: 3, schema: null })],
    ["a body without a version", () => json({ schema: SCHEMA })],
    [
      "a network error",
      () => {
        throw new TypeError("Failed to fetch");
      },
    ],
  ])("reports %s as a failed load", async (_, response) => {
    const { fetch } = fakeFetch(response);

    expect(await loadForm(FORM, { endpoint: ENDPOINT, fetch })).toEqual({
      kind: "error",
      reason: "failed",
    });
  });
});

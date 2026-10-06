import { describe, expect, it } from "vitest";
import { createTurnstileVerifier, SITEVERIFY_URL } from "./turnstile.ts";

const SECRET = "0x4AAAAAAAtestsecret";

/** A `fetch` that records each request and answers with `response`. */
function fakeFetch(response: () => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return response();
  };
  return { fetch, requests };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("createTurnstileVerifier", () => {
  it("asks Cloudflare's siteverify with the secret, the token and the visitor's IP", async () => {
    const { fetch, requests } = fakeFetch(() =>
      json({ success: true, "error-codes": [] }),
    );
    const verify = createTurnstileVerifier(SECRET, fetch);

    expect(await verify("token-1", { ip: "203.0.113.7" })).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(SITEVERIFY_URL);
    expect(requests[0].init.method).toBe("POST");
    expect(new Headers(requests[0].init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      secret: SECRET,
      response: "token-1",
      remoteip: "203.0.113.7",
    });
  });

  it("leaves out an unknown IP", async () => {
    const { fetch, requests } = fakeFetch(() => json({ success: true }));

    await createTurnstileVerifier(SECRET, fetch)("token-1", { ip: "unknown" });

    expect(JSON.parse(String(requests[0].init.body))).toEqual({
      secret: SECRET,
      response: "token-1",
    });
  });

  it.each([
    "invalid-input-response",
    "timeout-or-duplicate",
    "missing-input-response",
  ])("is false for a token Cloudflare refuses (%s)", async (code) => {
    const { fetch } = fakeFetch(() =>
      json({ success: false, "error-codes": [code] }),
    );

    expect(
      await createTurnstileVerifier(SECRET, fetch)("token-1", { ip: "x" }),
    ).toBe(false);
  });

  it.each([
    "internal-error",
    "invalid-input-secret",
    "missing-input-secret",
    "bad-request",
  ])("throws when Cloudflare cannot tell (%s)", async (code) => {
    const { fetch } = fakeFetch(() =>
      json({ success: false, "error-codes": [code] }),
    );

    await expect(
      createTurnstileVerifier(SECRET, fetch)("token-1", { ip: "x" }),
    ).rejects.toThrow(code);
  });

  it("throws when siteverify answers with an error status", async () => {
    const { fetch } = fakeFetch(
      () => new Response("bad gateway", { status: 502 }),
    );

    await expect(
      createTurnstileVerifier(SECRET, fetch)("token-1", { ip: "x" }),
    ).rejects.toThrow("502");
  });

  it("throws when siteverify cannot be reached", async () => {
    const verify = createTurnstileVerifier(SECRET, async () => {
      throw new TypeError("fetch failed");
    });

    await expect(verify("token-1", { ip: "x" })).rejects.toThrow(
      "fetch failed",
    );
  });

  it("is false for an answer without success", async () => {
    const { fetch } = fakeFetch(() => json({ "error-codes": [] }));

    expect(
      await createTurnstileVerifier(SECRET, fetch)("token-1", { ip: "x" }),
    ).toBe(false);
  });
});

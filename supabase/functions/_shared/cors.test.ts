import { describe, expect, it } from "vitest";
import { handleCors, withCorsHeaders } from "./cors.ts";

const ALLOWED = ["https://www.drk-rostock.de", "http://localhost:3000"];

const request = (init: RequestInit & { origin?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.origin) headers.set("origin", init.origin);
  return new Request("https://example.test/fn", { ...init, headers });
};

describe("handleCors", () => {
  it("lets a request from an allowed origin through", () => {
    expect(
      handleCors(request({ origin: "https://www.drk-rostock.de" }), ALLOWED, [
        "GET",
      ]),
    ).toEqual({ origin: "https://www.drk-rostock.de" });
  });

  it.each([
    ["an origin not on the list", "https://evil.example"],
    ["a look-alike origin", "https://www.drk-rostock.de.evil.example"],
    ["the same host over another scheme", "http://www.drk-rostock.de"],
    ["an opaque origin", "null"],
  ])("refuses %s with 403 and no CORS headers", async (_, origin) => {
    const result = handleCors(request({ origin }), ALLOWED, ["GET"]);

    if (!("response" in result)) throw new Error("expected a response");
    expect(result.response.status).toBe(403);
    expect(await result.response.json()).toEqual({
      error: "origin_not_allowed",
    });
    expect(
      result.response.headers.get("access-control-allow-origin"),
    ).toBeNull();
  });

  it("refuses a request without an origin", () => {
    const result = handleCors(request(), ALLOWED, ["GET"]);

    expect("response" in result && result.response.status).toBe(403);
  });

  it("answers a preflight from an allowed origin", () => {
    const result = handleCors(
      request({ method: "OPTIONS", origin: "http://localhost:3000" }),
      ALLOWED,
      ["GET"],
    );

    if (!("response" in result)) throw new Error("expected a response");
    expect(result.response.status).toBe(204);
    const headers = result.response.headers;
    expect(headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
    expect(headers.get("access-control-allow-headers")).toBe("content-type");
    expect(headers.get("vary")).toBe("Origin");
  });

  it("refuses a preflight from another origin", () => {
    const result = handleCors(
      request({ method: "OPTIONS", origin: "https://evil.example" }),
      ALLOWED,
      ["GET"],
    );

    expect("response" in result && result.response.status).toBe(403);
  });
});

describe("withCorsHeaders", () => {
  it("allows the origin to read the response and keeps it otherwise", async () => {
    const response = withCorsHeaders(
      new Response("hallo", { status: 201, headers: { "x-extra": "1" } }),
      "https://www.drk-rostock.de",
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://www.drk-rostock.de",
    );
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("x-extra")).toBe("1");
    expect(await response.text()).toBe("hallo");
  });
});

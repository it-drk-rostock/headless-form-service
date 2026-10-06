import { describe, expect, it } from "vitest";
import { jsonResponse, noStoreJsonResponse } from "./http.ts";

describe("jsonResponse", () => {
  it("serialises the body as JSON with a JSON content type", async () => {
    const response = jsonResponse({ hello: "welt" });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.json()).toEqual({ hello: "welt" });
  });

  it("keeps the status and extra headers passed in", () => {
    const response = jsonResponse(
      { error: "nope" },
      { status: 405, headers: { allow: "GET" } },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
  });
});

describe("noStoreJsonResponse", () => {
  it("answers JSON that is never cached, with the status and headers passed in", async () => {
    const response = noStoreJsonResponse({ error: "nope" }, 405, {
      allow: "GET",
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("allow")).toBe("GET");
    expect(await response.json()).toEqual({ error: "nope" });
  });
});

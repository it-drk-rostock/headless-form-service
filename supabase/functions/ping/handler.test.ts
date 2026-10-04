import { describe, expect, it } from "vitest";
import { handlePing } from "./handler.ts";

const fixedNow = () => new Date("2026-10-04T12:00:00.000Z");

describe("handlePing", () => {
  it("answers a GET with the service status and the injected time", async () => {
    const response = handlePing(new Request("https://example.test/ping"), {
      now: fixedNow,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      time: "2026-10-04T12:00:00.000Z",
    });
  });

  it("rejects other methods with 405 and an Allow header", () => {
    const response = handlePing(
      new Request("https://example.test/ping", { method: "POST" }),
      { now: fixedNow },
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});

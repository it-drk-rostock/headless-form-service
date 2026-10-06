import { describe, expect, it } from "vitest";
import { clientIp, type RateLimit, rateLimited } from "./rate-limit.ts";

const request = (forwardedFor?: string) =>
  new Request("https://example.test/fn", {
    headers:
      forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
  });

describe("clientIp", () => {
  it("is the first address Supabase's edge forwards", () => {
    expect(clientIp(request("203.0.113.7, 10.0.0.1"))).toBe("203.0.113.7");
    expect(clientIp(request(" 2001:db8::1 "))).toBe("2001:db8::1");
  });

  it("puts every request without an address into one shared bucket", () => {
    expect(clientIp(request())).toBe("unknown");
    expect(clientIp(request(" , 10.0.0.1"))).toBe("unknown");
  });
});

describe("rateLimited", () => {
  it("lets a request within the limit through, counting it under its IP", async () => {
    const calls: [string, RateLimit][] = [];

    const response = await rateLimited(
      request("203.0.113.7"),
      async (ip, limit) => {
        calls.push([ip, limit]);
        return true;
      },
      { requests: 3, window: "1 h" },
    );

    expect(response).toBeNull();
    expect(calls).toEqual([["203.0.113.7", { requests: 3, window: "1 h" }]]);
  });

  it("answers 429 once the limit is reached", async () => {
    const response = await rateLimited(
      request("203.0.113.7"),
      async () => false,
      { requests: 3, window: "1 h" },
    );

    expect(response?.status).toBe(429);
    expect(await response?.json()).toEqual({ error: "rate_limited" });
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses requests when the limiter fails, so nobody gets around it", async () => {
    const response = await rateLimited(
      request("203.0.113.7"),
      async () => {
        throw new Error("redis down");
      },
      { requests: 3, window: "1 h" },
    );

    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: "rate_limit_unavailable" });
  });
});

import { describe, expect, it, vi } from "vitest";
import { handleKeepAlive, type KeepAliveDeps } from "./handler.ts";

const fixedNow = () => new Date("2026-10-13T12:00:00.000Z");

function baseDeps(overrides: Partial<KeepAliveDeps> = {}): KeepAliveDeps {
  return {
    now: fixedNow,
    withinRateLimit: vi.fn().mockResolvedValue(true),
    touchDb: vi.fn().mockResolvedValue({
      status: "ok",
      last_seen_at: "2026-10-13T12:00:00.000Z",
      source: "cron",
      count: 42,
    }),
    ...overrides,
  };
}

describe("handleKeepAlive", () => {
  it("accepts both GET and POST requests", async () => {
    for (const method of ["GET", "POST"]) {
      const deps = baseDeps();
      const res = await handleKeepAlive(
        new Request("https://example.test/keep-alive", { method }),
        deps,
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        status: "ok",
        time: "2026-10-13T12:00:00.000Z",
        database: {
          status: "ok",
          last_seen_at: "2026-10-13T12:00:00.000Z",
          source: "cron",
          count: 42,
        },
        services: {
          database: "ok",
          redis: "ok",
          qstash: "skipped",
        },
      });
      expect(deps.touchDb).toHaveBeenCalledWith("cron");
    }
  });

  it("rejects unsupported methods with 405", async () => {
    const deps = baseDeps();
    const res = await handleKeepAlive(
      new Request("https://example.test/keep-alive", { method: "DELETE" }),
      deps,
    );

    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("GET, POST");
  });

  it("enforces Bearer authentication when authKey is set", async () => {
    const deps = baseDeps({ authKey: "secret-token-123" });

    // Missing header
    const noHeader = await handleKeepAlive(
      new Request("https://example.test/keep-alive", { method: "POST" }),
      deps,
    );
    expect(noHeader.status).toBe(401);
    expect(await noHeader.json()).toEqual({ error: "unauthorized" });

    // Wrong token
    const wrongHeader = await handleKeepAlive(
      new Request("https://example.test/keep-alive", {
        method: "POST",
        headers: { authorization: "Bearer wrong-token" },
      }),
      deps,
    );
    expect(wrongHeader.status).toBe(401);

    // Correct token with Bearer prefix
    const correctHeader = await handleKeepAlive(
      new Request("https://example.test/keep-alive", {
        method: "POST",
        headers: { authorization: "Bearer secret-token-123" },
      }),
      deps,
    );
    expect(correctHeader.status).toBe(200);

    // Correct bare token without Bearer prefix
    const bareTokenHeader = await handleKeepAlive(
      new Request("https://example.test/keep-alive", {
        method: "POST",
        headers: { authorization: "secret-token-123" },
      }),
      deps,
    );
    expect(bareTokenHeader.status).toBe(200);

    // Correct token via x-keepalive-key header
    const customHeader = await handleKeepAlive(
      new Request("https://example.test/keep-alive", {
        method: "POST",
        headers: { "x-keepalive-key": "secret-token-123" },
      }),
      deps,
    );
    expect(customHeader.status).toBe(200);
  });

  it("rate limits requests when the limiter returns false", async () => {
    const deps = baseDeps({
      withinRateLimit: vi.fn().mockResolvedValue(false),
    });

    const res = await handleKeepAlive(
      new Request("https://example.test/keep-alive", { method: "POST" }),
      deps,
    );

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "rate_limited" });
    expect(deps.touchDb).not.toHaveBeenCalled();
  });

  it("answers 503 when the rate limiter fails", async () => {
    const deps = baseDeps({
      withinRateLimit: vi.fn().mockRejectedValue(new Error("redis down")),
    });

    const res = await handleKeepAlive(
      new Request("https://example.test/keep-alive", { method: "POST" }),
      deps,
    );

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "rate_limit_unavailable" });
    expect(deps.touchDb).not.toHaveBeenCalled();
  });

  it("calls pingQStash when provided and reports ok", async () => {
    const pingQStash = vi.fn().mockResolvedValue({ messageId: "msg_123" });
    const deps = baseDeps({ pingQStash });

    const res = await handleKeepAlive(
      new Request("https://example.test/keep-alive", { method: "POST" }),
      deps,
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.services.qstash).toBe("ok");
    expect(pingQStash).toHaveBeenCalled();
  });

  it("handles QStash failures gracefully without failing the request", async () => {
    const pingQStash = vi.fn().mockRejectedValue(new Error("qstash timeout"));
    const deps = baseDeps({ pingQStash });

    const res = await handleKeepAlive(
      new Request("https://example.test/keep-alive", { method: "POST" }),
      deps,
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.services.qstash).toBe("failed");
  });

  it("answers 500 when database write fails", async () => {
    const deps = baseDeps({
      touchDb: vi.fn().mockRejectedValue(new Error("postgres connection error")),
    });

    const res = await handleKeepAlive(
      new Request("https://example.test/keep-alive", { method: "POST" }),
      deps,
    );

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error" });
  });
});

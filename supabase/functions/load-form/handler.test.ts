import { describe, expect, it } from "vitest";
import {
  handleLoadForm,
  type LoadedForm,
  type LoadFormDeps,
} from "./handler.ts";

const ORIGIN = "https://www.drk-rostock.de";
const FORM = "3f6c1a52-8d0e-4b7a-9c1d-2e5f8a9b0c1d";
const SCHEMA = {
  pages: [{ name: "seite1", elements: [{ type: "text", name: "vorname" }] }],
};

/**
 * In-memory fakes: one published public form, a record of counted loads, and
 * a rate limiter that counts requests per IP without ever forgetting them.
 */
function fakes(
  forms: Record<string, LoadedForm> = {
    [FORM]: { version: 3, schema: SCHEMA, accessType: "public" },
  },
) {
  const counted: string[] = [];
  const hits = new Map<string, number>();
  const deps: LoadFormDeps = {
    settings: async () => ({ allowedOrigins: [ORIGIN], rateLimit: 60 }),
    withinRateLimit: async (ip, perMinute) => {
      const count = (hits.get(ip) ?? 0) + 1;
      hits.set(ip, count);
      return count <= perMinute;
    },
    loadForm: async (id) => forms[id] ?? null,
    countLoad: async (id) => {
      counted.push(id);
    },
  };
  return { deps, counted, hits };
}

const get = (
  query: string,
  init: RequestInit & { origin?: string | null; ip?: string } = {},
) => {
  const headers = new Headers(init.headers);
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin) headers.set("origin", origin);
  headers.set("x-forwarded-for", init.ip ?? "203.0.113.7");
  return new Request(`https://example.test/load-form${query}`, {
    ...init,
    headers,
  });
};

describe("handleLoadForm", () => {
  it("serves the current version's number, questions and access type", async () => {
    const { deps } = fakes();

    const response = await handleLoadForm(get(`?form_id=${FORM}`), deps);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      version: 3,
      schema: SCHEMA,
      access_type: "public",
    });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("counts each load it serves", async () => {
    const { deps, counted } = fakes();

    await handleLoadForm(get(`?form_id=${FORM}`), deps);
    await handleLoadForm(get(`?form_id=${FORM}`), deps);

    expect(counted).toEqual([FORM, FORM]);
  });

  it("refuses other origins before touching the form", async () => {
    const { deps, counted } = fakes();
    let looked = false;
    deps.loadForm = async () => {
      looked = true;
      return null;
    };

    const response = await handleLoadForm(
      get(`?form_id=${FORM}`, { origin: "https://evil.example" }),
      deps,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_not_allowed" });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(looked).toBe(false);
    expect(counted).toEqual([]);
  });

  it("refuses requests without an origin", async () => {
    const { deps } = fakes();

    const response = await handleLoadForm(
      get(`?form_id=${FORM}`, { origin: null }),
      deps,
    );

    expect(response.status).toBe(403);
  });

  it("reads the allowed origins on every request", async () => {
    const { deps } = fakes();
    let origins = [ORIGIN];
    deps.settings = async () => ({ allowedOrigins: origins, rateLimit: 60 });

    expect((await handleLoadForm(get(`?form_id=${FORM}`), deps)).status).toBe(
      200,
    );
    origins = [];
    expect((await handleLoadForm(get(`?form_id=${FORM}`), deps)).status).toBe(
      403,
    );
  });

  it("answers 429 with CORS headers once an IP is over the load limit, without loading or counting", async () => {
    const { deps, counted } = fakes();
    deps.settings = async () => ({ allowedOrigins: [ORIGIN], rateLimit: 2 });

    await handleLoadForm(get(`?form_id=${FORM}`), deps);
    await handleLoadForm(get(`?form_id=${FORM}`), deps);
    const response = await handleLoadForm(get(`?form_id=${FORM}`), deps);

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "rate_limited" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(counted).toEqual([FORM, FORM]);
  });

  it("limits each IP on its own, by the load limit from the settings", async () => {
    const { deps } = fakes();
    const limits: number[] = [];
    deps.settings = async () => ({ allowedOrigins: [ORIGIN], rateLimit: 1 });
    const count = deps.withinRateLimit;
    deps.withinRateLimit = (ip, perMinute) => {
      limits.push(perMinute);
      return count(ip, perMinute);
    };

    await handleLoadForm(get(`?form_id=${FORM}`, { ip: "203.0.113.7" }), deps);
    const other = await handleLoadForm(
      get(`?form_id=${FORM}`, { ip: "198.51.100.4" }),
      deps,
    );

    expect(other.status).toBe(200);
    expect(limits).toEqual([1, 1]);
  });

  it("does not count other origins or preflights against the limit", async () => {
    const { deps, hits } = fakes();

    await handleLoadForm(
      get(`?form_id=${FORM}`, { origin: "https://evil.example" }),
      deps,
    );
    await handleLoadForm(get(`?form_id=${FORM}`, { method: "OPTIONS" }), deps);

    expect(hits.size).toBe(0);
  });

  it("still serves the form when the rate limiter fails", async () => {
    const { deps } = fakes();
    deps.withinRateLimit = async () => {
      throw new Error("redis down");
    };

    const response = await handleLoadForm(get(`?form_id=${FORM}`), deps);

    expect(response.status).toBe(200);
  });

  it("answers the preflight of an allowed origin", async () => {
    const { deps, counted } = fakes();

    const response = await handleLoadForm(
      get(`?form_id=${FORM}`, { method: "OPTIONS" }),
      deps,
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "GET, OPTIONS",
    );
    expect(counted).toEqual([]);
  });

  it("rejects other methods with 405 and an Allow header", async () => {
    const { deps } = fakes();

    const response = await handleLoadForm(
      get(`?form_id=${FORM}`, { method: "POST" }),
      deps,
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, OPTIONS");
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("asks for a form ID when there is none", async () => {
    const { deps } = fakes();

    const response = await handleLoadForm(get(""), deps);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "form_id_missing" });
  });

  it.each([
    ["an unknown form", "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"],
    ["an ID that is not a UUID", "kursanmeldung"],
  ])("answers 404 for %s, without counting", async (_, id) => {
    const { deps, counted } = fakes();

    const response = await handleLoadForm(get(`?form_id=${id}`), deps);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "form_not_found" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(counted).toEqual([]);
  });

  it("does not hand out a protected form's questions, without counting", async () => {
    const { deps, counted } = fakes({
      [FORM]: { version: 1, schema: SCHEMA, accessType: "protected" },
    });

    const response = await handleLoadForm(get(`?form_id=${FORM}`), deps);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "form_pass_invalid" });
    expect(counted).toEqual([]);
  });

  it("still serves the form when the load cannot be counted", async () => {
    const { deps } = fakes();
    deps.countLoad = async () => {
      throw new Error("connection refused");
    };

    const response = await handleLoadForm(get(`?form_id=${FORM}`), deps);

    expect(response.status).toBe(200);
    expect((await response.json()).version).toBe(3);
  });

  it("answers 500 with CORS headers when the database fails", async () => {
    const { deps } = fakes();
    deps.loadForm = async () => {
      throw new Error("connection refused");
    };

    const response = await handleLoadForm(get(`?form_id=${FORM}`), deps);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
  });

  it("answers 500 when the settings cannot be read", async () => {
    const { deps } = fakes();
    deps.settings = async () => {
      throw new Error("connection refused");
    };

    const response = await handleLoadForm(get(`?form_id=${FORM}`), deps);

    expect(response.status).toBe(500);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});

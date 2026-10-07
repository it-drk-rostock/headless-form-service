import { describe, expect, it } from "vitest";
import {
  formPassStatus,
  parseFormPage,
  parseFormPassInput,
  toFormPass,
} from "./passes.ts";

describe("parseFormPage", () => {
  it("is none when blank", () => {
    expect(parseFormPage("  ")).toEqual({ pageUrl: null });
  });

  it("keeps a web address as browsers write it", () => {
    expect(parseFormPage(" https://WWW.drk-rostock.de/kurs?id=3 ")).toEqual({
      pageUrl: "https://www.drk-rostock.de/kurs?id=3",
    });
    expect(parseFormPage("http://localhost:8000")).toEqual({
      pageUrl: "http://localhost:8000/",
    });
  });

  it("refuses anything but an http or https address", () => {
    for (const input of [
      "www.drk-rostock.de/kurs",
      "javascript:alert(1)",
      "ftp://drk-rostock.de",
      "https://user:pw@drk-rostock.de",
      `https://drk-rostock.de/${"a".repeat(2000)}`,
    ]) {
      expect(parseFormPage(input)).toEqual({ error: "forms.errorPageInvalid" });
    }
  });
});

describe("parseFormPassInput", () => {
  it("takes use limit, hours and metadata", () => {
    expect(
      parseFormPassInput({
        maxUses: 3,
        expiresInHours: 48,
        metadata: [
          { key: " ticket ", value: " T-17 " },
          { key: "", value: "" },
        ],
      }),
    ).toEqual({ maxUses: 3, expiresInHours: 48, metadata: { ticket: "T-17" } });
  });

  it("allows no use limit and no expiry", () => {
    expect(
      parseFormPassInput({ maxUses: null, expiresInHours: null, metadata: [] }),
    ).toEqual({ maxUses: null, expiresInHours: null, metadata: {} });
  });

  it("refuses use limits that are not a positive whole number", () => {
    for (const maxUses of [0, -1, 1.5, 10_001, "2"]) {
      expect(
        parseFormPassInput({ maxUses, expiresInHours: null, metadata: [] }),
      ).toEqual({ error: "forms.errorPassMaxUses" });
    }
  });

  it("refuses expiry hours that are not a positive whole number", () => {
    for (const expiresInHours of [0, 2.5, 8761, "48"]) {
      expect(
        parseFormPassInput({ maxUses: 1, expiresInHours, metadata: [] }),
      ).toEqual({ error: "forms.errorPassExpiry" });
    }
  });

  it("refuses values without key, repeated keys and bad keys", () => {
    const withMetadata = (metadata: { key: string; value: string }[]) =>
      parseFormPassInput({ maxUses: 1, expiresInHours: 48, metadata });
    expect(withMetadata([{ key: "", value: "x" }])).toEqual({
      error: "forms.errorPassMetadataKey",
    });
    expect(withMetadata([{ key: "mit leerzeichen", value: "x" }])).toEqual({
      error: "forms.errorPassMetadataKey",
    });
    expect(
      withMetadata([
        { key: "ticket", value: "1" },
        { key: "ticket", value: "2" },
      ]),
    ).toEqual({ error: "forms.errorPassMetadataDuplicate" });
    expect(withMetadata([{ key: "ticket", value: "x".repeat(501) }])).toEqual({
      error: "forms.errorPassMetadataValueTooLong",
    });
    expect(
      withMetadata(
        Array.from({ length: 21 }, (_, i) => ({ key: `k${i}`, value: "x" })),
      ),
    ).toEqual({ error: "forms.errorPassMetadataTooMany" });
  });

  it("refuses input of the wrong shape", () => {
    for (const input of [null, {}, { maxUses: 1, expiresInHours: 1 }]) {
      expect(parseFormPassInput(input)).toEqual({
        error: "forms.errorGeneric",
      });
    }
  });
});

describe("formPassStatus", () => {
  const now = new Date("2026-10-08T12:00:00Z");
  const pass = {
    revokedAt: null,
    expiresAt: "2026-10-09T12:00:00Z",
    maxUses: 2,
    useCount: 1,
  };

  it("is valid while not revoked, not expired and with uses left", () => {
    expect(formPassStatus(pass, now)).toBe("valid");
    expect(
      formPassStatus(
        { ...pass, maxUses: null, expiresAt: null, useCount: 99 },
        now,
      ),
    ).toBe("valid");
  });

  it("is used up once every use is taken", () => {
    expect(formPassStatus({ ...pass, useCount: 2 }, now)).toBe("used_up");
  });

  it("is expired from its expiry time on", () => {
    expect(
      formPassStatus({ ...pass, expiresAt: "2026-10-08T12:00:00Z" }, now),
    ).toBe("expired");
  });

  it("is revoked above all", () => {
    expect(
      formPassStatus(
        {
          ...pass,
          revokedAt: "2026-10-08T11:00:00Z",
          useCount: 2,
          expiresAt: "2026-10-01T00:00:00Z",
        },
        now,
      ),
    ).toBe("revoked");
  });
});

describe("toFormPass", () => {
  it("names the creator and computes the status", () => {
    expect(
      toFormPass(
        {
          id: "p1",
          max_uses: 1,
          use_count: 0,
          expires_at: null,
          revoked_at: null,
          source: "dashboard",
          metadata: { ticket: "T-17" },
          created_at: "2026-10-08T10:00:00Z",
          creator: { full_name: "", email: "max@drk-rostock.de" },
        },
        new Date("2026-10-08T12:00:00Z"),
      ),
    ).toEqual({
      id: "p1",
      maxUses: 1,
      useCount: 0,
      expiresAt: null,
      revokedAt: null,
      source: "dashboard",
      metadata: { ticket: "T-17" },
      createdAt: "2026-10-08T10:00:00Z",
      createdBy: "max@drk-rostock.de",
      status: "valid",
    });
  });
});

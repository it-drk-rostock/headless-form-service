import { describe, expect, it } from "vitest";
import { isEmailAddress, normalizeEmail } from "./email.ts";

describe("normalizeEmail", () => {
  it("trims and lower-cases, the way Supabase Auth stores addresses", () => {
    expect(normalizeEmail("  Lea.Kurz@DRK-Rostock.de ")).toBe(
      "lea.kurz@drk-rostock.de",
    );
  });
});

describe("isEmailAddress", () => {
  it("accepts an ordinary address", () => {
    expect(isEmailAddress("lea.kurz@drk-rostock.de")).toBe(true);
  });

  it("rejects what cannot be an address", () => {
    for (const email of [
      "",
      "lea",
      "lea@",
      "@drk-rostock.de",
      "lea@drk-rostock",
      "lea kurz@drk-rostock.de",
      "lea@@drk-rostock.de",
      `${"x".repeat(250)}@drk.de`,
    ]) {
      expect(isEmailAddress(email)).toBe(false);
    }
  });
});

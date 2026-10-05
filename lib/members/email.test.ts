import { describe, expect, it } from "vitest";
import { emailProblem, normalizeEmail } from "./email.ts";

describe("normalizeEmail", () => {
  it("trims and lower-cases, the way Supabase Auth stores addresses", () => {
    expect(normalizeEmail("  Lea.Kurz@DRK-Rostock.de ")).toBe(
      "lea.kurz@drk-rostock.de",
    );
  });
});

describe("emailProblem", () => {
  it("accepts an ordinary address", () => {
    expect(emailProblem("lea.kurz@drk-rostock.de")).toBeNull();
  });

  it("asks for an address when there is none", () => {
    expect(emailProblem("")).toBe("members.errorEmailMissing");
  });

  it("rejects what cannot be an address", () => {
    for (const email of [
      "lea",
      "lea@",
      "@drk-rostock.de",
      "lea@drk-rostock",
      "lea kurz@drk-rostock.de",
      "lea@@drk-rostock.de",
      `${"x".repeat(250)}@drk.de`,
    ]) {
      expect(emailProblem(email)).toBe("members.errorEmailInvalid");
    }
  });
});

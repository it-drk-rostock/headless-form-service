import { describe, expect, it } from "vitest";
import { emailProblem } from "./email.ts";

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

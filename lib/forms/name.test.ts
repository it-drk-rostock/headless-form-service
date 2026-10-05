import { describe, expect, it } from "vitest";
import { FORM_NAME_MAX_LENGTH, formNameProblem } from "./name.ts";

describe("formNameProblem", () => {
  it("accepts a name up to the maximum length", () => {
    expect(formNameProblem("Kursanmeldung")).toBeNull();
    expect(formNameProblem("x".repeat(FORM_NAME_MAX_LENGTH))).toBeNull();
  });

  it("rejects a blank name", () => {
    expect(formNameProblem("")).toBe("forms.errorNameMissing");
    expect(formNameProblem("   ")).toBe("forms.errorNameMissing");
  });

  it("rejects a name that is too long", () => {
    expect(formNameProblem("x".repeat(FORM_NAME_MAX_LENGTH + 1))).toBe(
      "forms.errorNameTooLong",
    );
  });
});

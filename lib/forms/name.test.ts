import { describe, expect, it } from "vitest";
import {
  confirmsDeletion,
  FORM_NAME_MAX_LENGTH,
  formNameProblem,
} from "./name.ts";

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

describe("confirmsDeletion", () => {
  it("accepts the form's name as typed, ignoring surrounding spaces", () => {
    expect(confirmsDeletion("Kursanmeldung", "Kursanmeldung")).toBe(true);
    expect(confirmsDeletion("  Kursanmeldung ", "Kursanmeldung")).toBe(true);
  });

  it("refuses anything else, other capitalisation too", () => {
    expect(confirmsDeletion("", "Kursanmeldung")).toBe(false);
    expect(confirmsDeletion("kursanmeldung", "Kursanmeldung")).toBe(false);
    expect(confirmsDeletion("Kursanmeldung 2", "Kursanmeldung")).toBe(false);
  });
});

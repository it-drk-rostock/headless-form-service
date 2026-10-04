import { describe, expect, it } from "vitest";
import { initials } from "./initials.ts";

describe("initials", () => {
  it("takes the first letters of the first and last name", () => {
    expect(initials("Anna Maria Schmidt", "a@x.de")).toBe("AS");
    expect(initials("  Özlem  ", "o@x.de")).toBe("Ö");
  });

  it("falls back to the email address when there is no name", () => {
    expect(initials("", "max.mustermann@drk-rostock.de")).toBe("M");
  });
});

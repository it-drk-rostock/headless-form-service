import { describe, expect, it } from "vitest";
import { t } from "./index.ts";

describe("t", () => {
  it("returns the German string for a key", () => {
    expect(t("auth.loginTitle")).toBe("Anmelden");
  });

  it("fills named placeholders", () => {
    expect(t("auth.newPasswordHint", { min: 10 })).toBe(
      "Mindestens 10 Zeichen.",
    );
  });

  it("leaves placeholders without a value untouched", () => {
    expect(t("auth.newPasswordHint")).toBe("Mindestens {min} Zeichen.");
  });
});

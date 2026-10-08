import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatPercent, t } from "./index.ts";

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

describe("formatDate", () => {
  it("writes a German date in Rostock's time zone", () => {
    expect(formatDate("2026-10-04T22:30:00Z")).toBe("05.10.2026");
  });
});

describe("formatDateTime", () => {
  it("writes a German date and time in Rostock's time zone", () => {
    expect(formatDateTime("2026-10-04T22:30:00Z")).toBe("05.10.2026, 00:30");
  });
});

describe("formatPercent", () => {
  it("writes a German percentage", () => {
    expect(formatPercent(0.125)).toMatch(/^12,5\s%$/);
    expect(formatPercent(1)).toMatch(/^100\s%$/);
  });
});

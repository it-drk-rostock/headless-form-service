import { describe, expect, it } from "vitest";
import { MAX_RECIPIENTS, parseRecipients } from "./recipients.ts";

describe("parseRecipients", () => {
  it("reads one address per line, normalised", () => {
    expect(
      parseRecipients(" Kurse@DRK-Rostock.de \nleitung@drk-rostock.de\n"),
    ).toEqual({
      recipients: ["kurse@drk-rostock.de", "leitung@drk-rostock.de"],
    });
  });

  it("also accepts commas and semicolons, as pasted from a mail program", () => {
    expect(
      parseRecipients("a@drk-rostock.de, b@drk-rostock.de; c@drk-rostock.de"),
    ).toEqual({
      recipients: ["a@drk-rostock.de", "b@drk-rostock.de", "c@drk-rostock.de"],
    });
  });

  it("keeps each address once, in the order given", () => {
    expect(
      parseRecipients("b@drk-rostock.de\na@drk-rostock.de\nB@drk-rostock.de"),
    ).toEqual({ recipients: ["b@drk-rostock.de", "a@drk-rostock.de"] });
  });

  it("allows no recipients at all", () => {
    expect(parseRecipients("  \n ")).toEqual({ recipients: [] });
  });

  it("names the first entry that is not an email address", () => {
    expect(parseRecipients("a@drk-rostock.de\nkurse\nauch-falsch@")).toEqual({
      error: "forms.errorRecipientInvalid",
      address: "kurse",
    });
  });

  it("refuses more than the maximum", () => {
    const many = Array.from(
      { length: MAX_RECIPIENTS + 1 },
      (_, i) => `r${i}@drk-rostock.de`,
    ).join("\n");
    expect(parseRecipients(many)).toEqual({
      error: "forms.errorTooManyRecipients",
    });
  });
});

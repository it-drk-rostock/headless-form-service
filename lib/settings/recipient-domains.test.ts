import { describe, expect, it } from "vitest";
import {
  MAX_RECIPIENT_DOMAINS,
  parseRecipientDomains,
} from "./recipient-domains.ts";

describe("parseRecipientDomains", () => {
  it("reads one domain per line", () => {
    expect(
      parseRecipientDomains("drk-rostock.de\nkv.drk-rostock.de\n"),
    ).toEqual({ domains: ["drk-rostock.de", "kv.drk-rostock.de"] });
  });

  it("also accepts commas, semicolons and spaces", () => {
    expect(parseRecipientDomains("a.de, b.de;c.de d.de")).toEqual({
      domains: ["a.de", "b.de", "c.de", "d.de"],
    });
  });

  it("stores domains in lower case, without a leading @", () => {
    expect(parseRecipientDomains("DRK-Rostock.DE\n@kv.drk-rostock.de")).toEqual(
      {
        domains: ["drk-rostock.de", "kv.drk-rostock.de"],
      },
    );
  });

  it("keeps each domain once, in the order given", () => {
    expect(parseRecipientDomains("b.de\na.de\nB.de")).toEqual({
      domains: ["b.de", "a.de"],
    });
  });

  it("allows no domains at all", () => {
    expect(parseRecipientDomains("  \n ")).toEqual({ domains: [] });
  });

  it.each([
    ["a whole address", "kurse@drk-rostock.de"],
    ["no dot", "localhost"],
    ["a wildcard", "*.drk-rostock.de"],
    ["a website address", "https://drk-rostock.de"],
    ["an empty label", "drk-rostock..de"],
    ["a trailing dot", "drk-rostock.de."],
    ["an umlaut", "drk-güstrow.de"],
    ["a label that is too long", `${"a".repeat(64)}.de`],
    ["a domain that is too long", `${"a.".repeat(127)}de`],
  ])("names an entry with %s", (_, domain) => {
    expect(parseRecipientDomains(`ok.de\n${domain}`)).toEqual({
      error: "settings.errorRecipientDomainInvalid",
      domain,
    });
  });

  it("refuses more than the maximum", () => {
    const many = Array.from(
      { length: MAX_RECIPIENT_DOMAINS + 1 },
      (_, i) => `ov${i}.drk-rostock.de`,
    ).join("\n");
    expect(parseRecipientDomains(many)).toEqual({
      error: "settings.errorTooManyRecipientDomains",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  isAllowedRecipient,
  recipientDomain,
  splitByAllowedDomain,
} from "./recipient-domains.ts";

describe("recipientDomain", () => {
  it("is the part after the @, in lower case", () => {
    expect(recipientDomain("Kurse@DRK-Rostock.de")).toBe("drk-rostock.de");
  });
});

describe("isAllowedRecipient", () => {
  const domains = ["drk-rostock.de", "kv.drk-rostock.de"];

  it("allows addresses on a listed domain", () => {
    expect(isAllowedRecipient("kurse@drk-rostock.de", domains)).toBe(true);
    expect(isAllowedRecipient("leitung@kv.drk-rostock.de", domains)).toBe(true);
  });

  it("ignores the case of the address", () => {
    expect(isAllowedRecipient("Kurse@DRK-Rostock.DE", domains)).toBe(true);
  });

  it.each([
    ["a private mailbox", "erika@gmail.com"],
    ["an unlisted subdomain", "kurse@ov.drk-rostock.de"],
    ["a look-alike domain", "kurse@drk-rostock.de.evil.com"],
    ["a domain ending like a listed one", "kurse@fake-drk-rostock.de"],
    ["no @ at all", "drk-rostock.de"],
  ])("refuses %s", (_, address) => {
    expect(isAllowedRecipient(address, domains)).toBe(false);
  });

  it("refuses every address when no domain is allowed", () => {
    expect(isAllowedRecipient("kurse@drk-rostock.de", [])).toBe(false);
  });
});

describe("splitByAllowedDomain", () => {
  it("keeps the allowed addresses, in order", () => {
    expect(
      splitByAllowedDomain(
        ["a@drk-rostock.de", "b@gmail.com", "c@drk-rostock.de"],
        ["drk-rostock.de"],
      ),
    ).toEqual({
      allowed: ["a@drk-rostock.de", "c@drk-rostock.de"],
      refused: ["b@gmail.com"],
    });
  });
});

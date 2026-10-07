import { describe, expect, it } from "vitest";
import { MAX_ALLOWED_ORIGINS, parseAllowedOrigins } from "./origins.ts";

describe("parseAllowedOrigins", () => {
  it("reads one origin per line", () => {
    expect(
      parseAllowedOrigins(
        "https://www.drk-rostock.de\nhttp://localhost:3000\n",
      ),
    ).toEqual({
      origins: ["https://www.drk-rostock.de", "http://localhost:3000"],
    });
  });

  it("also accepts commas, semicolons and spaces", () => {
    expect(
      parseAllowedOrigins(
        "https://a.de, https://b.de;https://c.de https://d.de",
      ),
    ).toEqual({
      origins: ["https://a.de", "https://b.de", "https://c.de", "https://d.de"],
    });
  });

  it("writes each origin as the browser sends it", () => {
    expect(
      parseAllowedOrigins(
        "HTTPS://WWW.DRK-Rostock.de/\nhttps://kurse.drk-rostock.de:443\nhttp://localhost:80",
      ),
    ).toEqual({
      origins: [
        "https://www.drk-rostock.de",
        "https://kurse.drk-rostock.de",
        "http://localhost",
      ],
    });
  });

  it("writes international domains in their ASCII form", () => {
    expect(parseAllowedOrigins("https://drk-güstrow.de")).toEqual({
      origins: ["https://xn--drk-gstrow-eeb.de"],
    });
  });

  it("keeps each origin once, in the order given", () => {
    expect(
      parseAllowedOrigins("https://b.de\nhttps://a.de\nhttps://B.de/"),
    ).toEqual({ origins: ["https://b.de", "https://a.de"] });
  });

  it("allows no origins at all", () => {
    expect(parseAllowedOrigins("  \n ")).toEqual({ origins: [] });
  });

  it.each([
    ["no scheme", "www.drk-rostock.de"],
    ["another scheme", "ftp://www.drk-rostock.de"],
    ["a path", "https://www.drk-rostock.de/kurse"],
    ["a query", "https://www.drk-rostock.de/?a=1"],
    ["a fragment", "https://www.drk-rostock.de/#top"],
    ["credentials", "https://user:pw@www.drk-rostock.de"],
    ["a wildcard", "https://*.drk-rostock.de"],
    ["an IPv6 address", "http://[::1]:3000"],
    ["no host", "https://"],
  ])("names an entry with %s", (_, origin) => {
    expect(parseAllowedOrigins(`https://ok.de\n${origin}`)).toEqual({
      error: "settings.errorOriginInvalid",
      origin,
    });
  });

  it("refuses more than the maximum", () => {
    const many = Array.from(
      { length: MAX_ALLOWED_ORIGINS + 1 },
      (_, i) => `https://site${i}.drk-rostock.de`,
    ).join("\n");
    expect(parseAllowedOrigins(many)).toEqual({
      error: "settings.errorTooManyOrigins",
    });
  });
});

import { describe, expect, it } from "vitest";
import { MAX_RATE_LIMIT, parseRateLimit } from "./rate-limits.ts";

describe("parseRateLimit", () => {
  it("reads a whole number of requests", () => {
    expect(parseRateLimit(" 60 ")).toBe(60);
  });

  it("accepts the bounds", () => {
    expect(parseRateLimit("1")).toBe(1);
    expect(parseRateLimit(String(MAX_RATE_LIMIT))).toBe(MAX_RATE_LIMIT);
  });

  it.each([
    ["nothing", ""],
    ["zero", "0"],
    ["a negative number", "-5"],
    ["a fraction", "2.5"],
    ["a decimal comma", "2,5"],
    ["a word", "zehn"],
    ["an exponent", "1e3"],
    ["more than the maximum", String(MAX_RATE_LIMIT + 1)],
    ["a huge number", "9".repeat(30)],
  ])("refuses %s", (_, input) => {
    expect(parseRateLimit(input)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { pageCount, parsePage } from "./page.ts";

describe("parsePage", () => {
  it("reads a positive page number", () => {
    expect(parsePage("3")).toBe(1 + 2);
  });

  it("falls back to the first page for anything else", () => {
    for (const value of [undefined, "", "0", "-2", "1.5", "abc", ["2", "3"]]) {
      expect(parsePage(value)).toBe(1);
    }
  });
});

describe("pageCount", () => {
  it("is at least one page", () => {
    expect(pageCount(0)).toBe(1);
  });

  it("rounds up to whole pages", () => {
    expect(pageCount(50)).toBe(1);
    expect(pageCount(51)).toBe(2);
  });
});

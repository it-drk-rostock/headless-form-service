import { describe, expect, it } from "vitest";
import {
  conversionRate,
  deliveryRate,
  formatStatisticsPoint,
  parseFormStatistics,
  statisticsPeriod,
} from "./statistics.ts";

const totals = { submissions: 0, queued: 0, sent: 0, failed: 0, loads: 0 };

describe("statisticsPeriod", () => {
  it("opens the period the URL names", () => {
    expect(statisticsPeriod("1")).toBe(1);
    expect(statisticsPeriod("7")).toBe(7);
    expect(statisticsPeriod("90")).toBe(90);
  });

  it("is 30 days if none or unknown", () => {
    expect(statisticsPeriod(undefined)).toBe(30);
    expect(statisticsPeriod("365")).toBe(30);
    expect(statisticsPeriod(["7", "1"])).toBe(30);
  });
});

describe("deliveryRate", () => {
  it("is the share of finished deliveries that were sent", () => {
    expect(deliveryRate({ ...totals, sent: 3, failed: 1, queued: 5 })).toBe(
      0.75,
    );
  });

  it("is null while no delivery has finished", () => {
    expect(deliveryRate({ ...totals, queued: 2 })).toBeNull();
  });
});

describe("conversionRate", () => {
  it("is submissions per form load", () => {
    expect(conversionRate({ ...totals, submissions: 3, loads: 12 })).toBe(0.25);
  });

  it("is null without loads", () => {
    expect(conversionRate({ ...totals, submissions: 2 })).toBeNull();
  });
});

describe("parseFormStatistics", () => {
  const stats = {
    by: "day",
    from: "2026-10-02",
    to: "2026-10-08",
    series: [
      { at: "2026-10-02", submissions: 1, sent: 1, failed: 0, loads: 4 },
    ],
    totals: { ...totals, submissions: 1, sent: 1, loads: 4 },
    versions: [{ version: 2, submissions: 1 }],
  };

  it("reads what public.form_statistics returns", () => {
    expect(parseFormStatistics(stats)).toEqual(stats);
  });

  it("is null for a form the person may not see", () => {
    expect(parseFormStatistics(null)).toBeNull();
  });

  it("refuses anything else", () => {
    expect(() => parseFormStatistics({ ...stats, by: "week" })).toThrow();
    expect(() => parseFormStatistics({ ...stats, series: null })).toThrow();
  });
});

describe("formatStatisticsPoint", () => {
  it("labels days and hours briefly", () => {
    expect(formatStatisticsPoint("2026-10-08")).toBe("08.10.");
    expect(formatStatisticsPoint("2026-10-08T09:00")).toBe("9 Uhr");
  });

  it("labels them in full for tooltips", () => {
    expect(formatStatisticsPoint("2026-10-08", true)).toBe("08.10.2026");
    expect(formatStatisticsPoint("2026-10-08T14:00", true)).toBe(
      "08.10.2026, 14 Uhr",
    );
  });
});

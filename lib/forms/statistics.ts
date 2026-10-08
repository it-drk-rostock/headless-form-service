import { t } from "../i18n/index.ts";

/**
 * The periods the *Statistik* view offers, in Berlin days up to today: 1 is
 * today by hour, the others are by day.
 */
export const STATISTICS_PERIODS = [1, 7, 30, 90] as const;
export type StatisticsPeriod = (typeof STATISTICS_PERIODS)[number];

/** The period a `?period=` search parameter asks for, 30 days if none or unknown. */
export function statisticsPeriod(
  param: string | string[] | undefined,
): StatisticsPeriod {
  const days = Number(param);
  return (STATISTICS_PERIODS as readonly number[]).includes(days) &&
    typeof param === "string"
    ? (days as StatisticsPeriod)
    : 30;
}

export type StatisticsTotals = {
  submissions: number;
  /** Not yet delivered (or delivered again after a retry). */
  queued: number;
  sent: number;
  failed: number;
  /** Form loads; counted per day only. */
  loads: number;
};

/** One hour (`YYYY-MM-DDTHH:00`) or day (`YYYY-MM-DD`), Berlin time. */
export type StatisticsPoint = {
  at: string;
  submissions: number;
  sent: number;
  failed: number;
  /** Null per hour: loads are counted per day only. */
  loads: number | null;
};

/** A form's statistics for a period, as `public.form_statistics` returns them (blueprint §8). */
export type FormStatistics = {
  by: "hour" | "day";
  /** The period's first and last Berlin day, `YYYY-MM-DD`. */
  from: string;
  to: string;
  /** Every hour or day of the period, oldest first. */
  series: StatisticsPoint[];
  totals: StatisticsTotals;
  /** Submissions per form version in the period, newest version first. */
  versions: { version: number; submissions: number }[];
};

/**
 * What `public.form_statistics` returned: null for a form the person may not
 * see. Throws on any other shape, which only a changed function returns.
 */
export function parseFormStatistics(value: unknown): FormStatistics | null {
  if (value === null) return null;
  const stats = value as FormStatistics;
  if (
    (stats.by !== "hour" && stats.by !== "day") ||
    !Array.isArray(stats.series) ||
    !Array.isArray(stats.versions) ||
    typeof stats.totals?.submissions !== "number"
  ) {
    throw new Error("Unexpected form statistics");
  }
  return stats;
}

/** Sent vs failed: the share of finished deliveries that were sent, null while none has finished. */
export function deliveryRate(totals: StatisticsTotals): number | null {
  const finished = totals.sent + totals.failed;
  return finished === 0 ? null : totals.sent / finished;
}

/**
 * Conversion: submissions per form load, null without loads. It can exceed 1
 * when forms loaded before the period are sent within it.
 */
export function conversionRate(totals: StatisticsTotals): number | null {
  return totals.loads === 0 ? null : totals.submissions / totals.loads;
}

/**
 * A point's time as the chart labels it: `14 Uhr` for an hour, `08.10.` for
 * a day, or with `long`, `08.10.2026` and `08.10.2026, 14 Uhr`.
 */
export function formatStatisticsPoint(at: string, long = false): string {
  const [date, time] = at.split("T");
  const [year, month, day] = date.split("-");
  const hour = time
    ? t("forms.statisticsHour", { hour: Number(time.slice(0, 2)) })
    : null;
  if (!long) return hour ?? t("forms.statisticsDay", { day, month });
  const fullDate = t("forms.statisticsDate", { day, month, year });
  return hour
    ? t("forms.statisticsDateHour", { date: fullDate, hour })
    : fullDate;
}

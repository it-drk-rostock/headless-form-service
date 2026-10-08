import { de } from "./de.ts";

/** German is the only locale for now (blueprint §1.2); other languages add a sibling of `de.ts`. */
export const locale = "de";

export type MessageKey = keyof typeof de;

/** Looks up a string and fills `{name}` placeholders from `params`. */
export function t(
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const message: string = de[key];
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in params ? String(params[name]) : placeholder,
  );
}

// Fixed time zone, so the server (UTC on Cloudflare) and the browser render the same text.
const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeZone: "Europe/Berlin",
});

/** A timestamp as a German date, e.g. "05.10.2026". */
export function formatDate(isoTimestamp: string): string {
  return dateFormat.format(new Date(isoTimestamp));
}

const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

/** A timestamp as a German date and time, e.g. "05.10.2026, 00:30". */
export function formatDateTime(isoTimestamp: string): string {
  return dateTimeFormat.format(new Date(isoTimestamp));
}

const percentFormat = new Intl.NumberFormat("de-DE", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** A share as a German percentage, e.g. "12,5 %". */
export function formatPercent(share: number): string {
  return percentFormat.format(share);
}

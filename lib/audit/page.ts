/** Entries per page of the audit log. */
export const AUDIT_PAGE_SIZE = 50;

/** The `?seite=` search param as a page number; anything odd is page 1. */
export function parsePage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  return Number(value);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
}

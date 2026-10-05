// lib/shared/ must load in the dashboard, the edge functions and the embed, so
// use Web-standard globals only: no Node-, Deno- or Next-specific APIs.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `id` is shaped like a UUID, as every ID in the database is. */
export function isUuid(id: string): boolean {
  return UUID.test(id);
}

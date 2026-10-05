const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether `id` can be a team ID at all; anything else is simply not found. */
export function isTeamId(id: string): boolean {
  return UUID.test(id);
}

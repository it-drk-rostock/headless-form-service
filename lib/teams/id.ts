import { isUuid } from "../shared/uuid.ts";

/** Whether `id` can be a team ID at all; anything else is simply not found. */
export function isTeamId(id: string): boolean {
  return isUuid(id);
}

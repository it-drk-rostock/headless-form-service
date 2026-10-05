import { isUuid } from "../shared/uuid.ts";

/** Whether `id` can be a form ID at all; anything else is simply not found. */
export function isFormId(id: string): boolean {
  return isUuid(id);
}

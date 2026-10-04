import { de } from "./de.ts";

/** German is the only locale for now (blueprint §1.2); other languages add a sibling of `de.ts`. */
export const locale = "de";

export type MessageKey = keyof typeof de;

export function t(key: MessageKey): string {
  return de[key];
}

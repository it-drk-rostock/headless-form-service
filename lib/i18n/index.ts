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

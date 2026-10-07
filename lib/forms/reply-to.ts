import type { MessageKey } from "../i18n/index.ts";

export type ParsedReplyToQuestion =
  | { replyToQuestion: string | null }
  | { error: MessageKey };

/**
 * The Reply-To question as chosen in the settings: one of `choices`, the
 * email questions of the current version, or none (empty). The `stored`
 * question stays allowed, so a form whose newer version dropped it can still
 * save its other settings; the dispatcher then simply finds no address.
 */
export function parseReplyToQuestion(
  input: string,
  { choices, stored }: { choices: string[]; stored: string | null },
): ParsedReplyToQuestion {
  if (input === "") return { replyToQuestion: null };
  if (input === stored || choices.includes(input)) {
    return { replyToQuestion: input };
  }
  return { error: "forms.errorReplyToInvalid" };
}

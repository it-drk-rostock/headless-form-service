import type { MessageKey } from "../i18n/index.ts";
import { isEmailAddress, normalizeEmail } from "../shared/email.ts";

/** Same limit as the `forms_recipients_check` constraint in the database. */
export const MAX_RECIPIENTS = 20;

export type ParsedRecipients =
  | { recipients: string[] }
  | { error: MessageKey; address?: string };

/**
 * The recipient list as typed: one address per line, or separated by commas
 * or semicolons. Addresses are normalised and kept once each, in order.
 * The database checks them against the allowed recipient domains.
 */
export function parseRecipients(input: string): ParsedRecipients {
  const recipients = [
    ...new Set(
      input
        .split(/[\s,;]+/)
        .map(normalizeEmail)
        .filter((address) => address !== ""),
    ),
  ];
  const invalid = recipients.find((address) => !isEmailAddress(address));
  if (invalid !== undefined) {
    return { error: "forms.errorRecipientInvalid", address: invalid };
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return { error: "forms.errorTooManyRecipients" };
  }
  return { recipients };
}

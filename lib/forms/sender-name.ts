import type { MessageKey } from "../i18n/index.ts";

/** Same limit as the `forms_sender_display_name_check` constraint in the database. */
export const SENDER_NAME_MAX_LENGTH = 100;

/**
 * Why a sender display name (already normalised by `normalizeSenderName`
 * from lib/shared/notification.ts) cannot be saved, or null if it can. */
export function senderNameProblem(name: string): MessageKey | null {
  return name.length > SENDER_NAME_MAX_LENGTH
    ? "forms.errorSenderNameTooLong"
    : null;
}

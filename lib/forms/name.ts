import type { MessageKey } from "../i18n/index.ts";

/** Same limit as the `forms_name_check` constraint in the database. */
export const FORM_NAME_MAX_LENGTH = 200;

/** Why a form name (already trimmed or not) cannot be saved, or null if it can. */
export function formNameProblem(name: string): MessageKey | null {
  const trimmed = name.trim();
  if (!trimmed) return "forms.errorNameMissing";
  if (trimmed.length > FORM_NAME_MAX_LENGTH) return "forms.errorNameTooLong";
  return null;
}

/**
 * Whether what someone typed into the hard-delete dialog is the form's name,
 * so a form is never deleted for good by a stray click.
 */
export function confirmsDeletion(typed: string, name: string): boolean {
  return typed.trim() === name.trim();
}

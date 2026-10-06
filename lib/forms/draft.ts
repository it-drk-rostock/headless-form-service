import type { MessageKey } from "../i18n/index.ts";
import { isObject } from "../shared/object.ts";
import { type ProfileNameRow, profileName } from "../shared/profile.ts";

/**
 * Question types the designer does not offer: submissions travel through
 * QStash, whose size limit rules out files (.scratch/file-uploads/spec.md).
 * Same list as the `forms_draft_schema_question_types_check` constraint.
 */
export const DISABLED_QUESTION_TYPES = ["file", "signaturepad"] as const;

/** A SurveyJS form definition: the draft's questions. */
export type DraftSchema = Record<string, unknown>;

/**
 * Who saved the draft last and when. `savedAt` is null until the first save;
 * `savedBy` is null when the person is gone or not visible.
 */
export type DraftStamp = { savedAt: string | null; savedBy: string | null };

/** A form's draft questions, as the designer opens them. */
export type FormDraft = { schema: DraftSchema; stamp: DraftStamp };

/** The columns behind a `DraftStamp`; the editor's profile through its foreign key. */
export const DRAFT_STAMP_COLUMNS =
  "created_at, draft_updated_at, editor:profiles!forms_draft_updated_by_fkey(full_name, email)";

export type DraftStampRow = {
  created_at: string;
  draft_updated_at: string;
  editor: ProfileNameRow | null;
};

export function toDraftStamp(row: DraftStampRow): DraftStamp {
  // A new form's draft carries the creation time, but nobody saved it.
  const neverSaved = !row.editor && row.draft_updated_at === row.created_at;
  return {
    savedAt: neverSaved ? null : row.draft_updated_at,
    savedBy: profileName(row.editor),
  };
}

/** Why a SurveyJS schema cannot be saved as the draft, or null if it can. */
export function draftSchemaProblem(schema: unknown): MessageKey | null {
  if (!isObject(schema)) return "forms.errorDraftInvalid";
  if (hasDisabledQuestion(schema)) return "forms.errorDraftQuestionType";
  return null;
}

// Like the database constraint: any `type` anywhere, ignoring case.
function hasDisabledQuestion(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasDisabledQuestion);
  if (!isObject(value)) return false;
  const type = value.type;
  if (
    typeof type === "string" &&
    (DISABLED_QUESTION_TYPES as readonly string[]).includes(type.toLowerCase())
  ) {
    return true;
  }
  return Object.values(value).some(hasDisabledQuestion);
}

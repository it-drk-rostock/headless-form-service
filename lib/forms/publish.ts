import type { MessageKey } from "../i18n/index.ts";
import { type EmailQuestion, emailQuestions } from "../shared/notification.ts";
import { type ProfileNameRow, profileName } from "../shared/profile.ts";

/** Same limit as the `form_versions_changelog_check` constraint in the database. */
export const CHANGELOG_MAX_LENGTH = 2000;

/** The changelog as stored: trimmed, and null when blank (it is optional). */
export function normalizeChangelog(changelog: string): string | null {
  return changelog.trim() || null;
}

/** Why a changelog cannot be published, or null if it can. */
export function changelogProblem(changelog: string): MessageKey | null {
  const normalized = normalizeChangelog(changelog);
  if (normalized && normalized.length > CHANGELOG_MAX_LENGTH) {
    return "forms.errorChangelogTooLong";
  }
  return null;
}

/**
 * A form version as the version history lists it. `publishedBy` is null
 * when the account is gone or not visible.
 */
export type FormVersion = {
  version: number;
  changelog: string | null;
  publishedAt: string;
  publishedBy: string | null;
};

/** The columns behind a `FormVersion`; the publisher's profile through its foreign key. */
export const FORM_VERSION_COLUMNS =
  "version, changelog, created_at, publisher:profiles!form_versions_created_by_fkey(full_name, email)";

export type FormVersionRow = {
  version: number;
  changelog: string | null;
  created_at: string;
  publisher: ProfileNameRow | null;
};

export function toFormVersion(row: FormVersionRow): FormVersion {
  return {
    version: row.version,
    changelog: row.changelog,
    publishedAt: row.created_at,
    publishedBy: profileName(row.publisher),
  };
}

/** The current version of a published form. */
export type CurrentVersion = FormVersion & {
  /** The version's email questions, which can be the Reply-To question. */
  emailQuestions: EmailQuestion[];
};

/** The columns behind a `CurrentVersion`. */
export const CURRENT_VERSION_COLUMNS = `${FORM_VERSION_COLUMNS}, schema`;

export type CurrentVersionRow = FormVersionRow & { schema: unknown };

export function toCurrentVersion(row: CurrentVersionRow): CurrentVersion {
  return { ...toFormVersion(row), emailQuestions: emailQuestions(row.schema) };
}

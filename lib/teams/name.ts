import type { MessageKey } from "../i18n/index.ts";

/** Same limit as the `teams_name_check` constraint in the database. */
export const TEAM_NAME_MAX_LENGTH = 100;

/** Why a team name (already trimmed or not) cannot be saved, or null if it can. */
export function teamNameProblem(name: string): MessageKey | null {
  const trimmed = name.trim();
  if (!trimmed) return "teams.errorNameMissing";
  if (trimmed.length > TEAM_NAME_MAX_LENGTH) return "teams.errorNameTooLong";
  return null;
}

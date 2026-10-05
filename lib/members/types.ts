import type { TeamRole } from "../teams/types.ts";

/** Longest optional name accepted when inviting someone new. */
export const FULL_NAME_MAX_LENGTH = 100;

/** One person in a team's member list. */
export type Member = {
  userId: string;
  fullName: string;
  email: string;
  role: TeamRole;
  /** When they joined this team. */
  since: string;
};

/** How a member is named in lists: their name, or their address if they have none. */
export function memberName(member: Pick<Member, "fullName" | "email">): string {
  return member.fullName || member.email;
}

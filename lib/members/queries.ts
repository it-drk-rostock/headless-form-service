import "server-only";
import { cache } from "react";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "../teams/id.ts";
import type { TeamRole } from "../teams/types.ts";
import { type Member, memberName } from "./types.ts";

type MemberRow = {
  user_id: string;
  role: TeamRole;
  created_at: string;
  profiles: { full_name: string; email: string } | null;
};

const collator = new Intl.Collator("de-DE", { sensitivity: "base" });

/**
 * A team's members, Team Admins first, then by name. RLS returns nothing for
 * a team the person may not see. Cached per request.
 */
export const listMembers = cache(async (teamId: string): Promise<Member[]> => {
  if (!isTeamId(teamId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("team_members")
    .select("user_id, role, created_at, profiles(full_name, email)")
    .eq("team_id", teamId)
    .overrideTypes<MemberRow[], { merge: false }>();
  if (error) {
    throw new Error(
      `Members of team ${teamId} could not be loaded: ${error.message}`,
    );
  }
  return data
    .map((row) => ({
      userId: row.user_id,
      fullName: row.profiles?.full_name ?? "",
      email: row.profiles?.email ?? "",
      role: row.role,
      since: row.created_at,
    }))
    .sort(
      (a, b) =>
        Number(b.role === "team_admin") - Number(a.role === "team_admin") ||
        collator.compare(memberName(a), memberName(b)),
    );
});

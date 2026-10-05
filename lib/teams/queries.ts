import "server-only";
import { cache } from "react";
import { requireProfile } from "../auth/profile.ts";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "./id.ts";
import type { TeamDetails, TeamRole, TeamSummary } from "./types.ts";

type TeamRow = {
  id: string;
  name: string;
  created_at: string;
  team_members: { role: TeamRole }[];
};

// Embeds only the signed-in person's own membership, which gives their role.
const TEAM_COLUMNS = "id, name, created_at, team_members(role)";

function toSummary(row: TeamRow): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    role: row.team_members[0]?.role ?? null,
    createdAt: row.created_at,
  };
}

/**
 * The teams the signed-in person belongs to; every team for a Super Admin.
 * RLS decides which rows come back. Cached per request for layout and page.
 */
export const listMyTeams = cache(async (): Promise<TeamSummary[]> => {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select(TEAM_COLUMNS)
    .eq("team_members.user_id", profile.id)
    .order("name")
    .overrideTypes<TeamRow[], { merge: false }>();
  if (error) throw new Error(`Teams could not be loaded: ${error.message}`);
  return data.map(toSummary);
});

/** One team, or null when it does not exist or the person may not see it. */
export const getTeam = cache(
  async (id: string): Promise<TeamDetails | null> => {
    if (!isTeamId(id)) return null;
    const profile = await requireProfile();
    const supabase = await createClient();
    const [team, members] = await Promise.all([
      supabase
        .from("teams")
        .select(TEAM_COLUMNS)
        .eq("id", id)
        .eq("team_members.user_id", profile.id)
        .maybeSingle()
        .overrideTypes<TeamRow, { merge: false }>(),
      supabase
        .from("team_members")
        .select("user_id", { count: "exact", head: true })
        .eq("team_id", id),
    ]);
    if (team.error) {
      throw new Error(`Team ${id} could not be loaded: ${team.error.message}`);
    }
    if (members.error) {
      throw new Error(
        `Members of team ${id} could not be counted: ${members.error.message}`,
      );
    }
    if (!team.data) return null;
    return { ...toSummary(team.data), memberCount: members.count ?? 0 };
  },
);

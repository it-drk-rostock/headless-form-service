import "server-only";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "../teams/id.ts";
import { AUDIT_PAGE_SIZE } from "./page.ts";
import type { AuditPage } from "./types.ts";

type AuditRow = {
  id: number;
  team_id: string | null;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
};

/**
 * One page of the audit log, newest first: one team's entries, or every
 * entry the person may see. RLS decides: Super Admins see all, Team Admins
 * their teams', everyone else nothing.
 */
export async function listAuditEntries({
  teamId,
  page,
}: {
  teamId?: string;
  page: number;
}): Promise<AuditPage> {
  if (teamId !== undefined && !isTeamId(teamId)) {
    return { entries: [], total: 0 };
  }
  const supabase = await createClient();
  const from = (page - 1) * AUDIT_PAGE_SIZE;
  let query = supabase
    .from("audit_log")
    .select("id, team_id, actor_email, action, details, created_at", {
      count: "exact",
    })
    .order("id", { ascending: false })
    .range(from, from + AUDIT_PAGE_SIZE - 1);
  if (teamId) query = query.eq("team_id", teamId);
  const { data, error, count } = await query.overrideTypes<
    AuditRow[],
    { merge: false }
  >();
  if (error) {
    // Past the last page PostgREST answers 416; show an empty page instead.
    if (error.code === "PGRST103") return { entries: [], total: count ?? 0 };
    throw new Error(`Audit log could not be loaded: ${error.message}`);
  }

  // No foreign key to teams (entries outlive them), so names come separately.
  const teamIds = [
    ...new Set(data.flatMap((row) => (row.team_id ? [row.team_id] : []))),
  ];
  const teamNames = new Map<string, string>();
  if (teamIds.length > 0) {
    const teams = await supabase
      .from("teams")
      .select("id, name")
      .in("id", teamIds);
    if (teams.error) {
      throw new Error(`Team names could not be loaded: ${teams.error.message}`);
    }
    for (const team of teams.data) teamNames.set(team.id, team.name);
  }

  return {
    total: count ?? 0,
    entries: data.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      teamName: row.team_id ? (teamNames.get(row.team_id) ?? null) : null,
      actorEmail: row.actor_email,
      action: row.action,
      details: row.details,
      createdAt: row.created_at,
    })),
  };
}

/** Mirrors the `public.team_role` enum. */
export type TeamRole = "team_admin" | "member";

/** A team as navigation and lists show it. */
export type TeamSummary = {
  id: string;
  name: string;
  /** The signed-in person's role, or null for a Super Admin outside the team. */
  role: TeamRole | null;
  createdAt: string;
};

export type TeamDetails = TeamSummary & { memberCount: number };

/** One row of the audit log as the dashboard shows it. */
export type AuditEntry = {
  id: number;
  teamId: string | null;
  /** Null when the entry concerns no team, or the team is gone. */
  teamName: string | null;
  /** The address the actor had when they acted; null for the system. */
  actorEmail: string | null;
  /** E.g. `member.added`; see `supabase/migrations/*_audit_log.sql`. */
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
};

/** One page of the log, and how many entries there are in all. */
export type AuditPage = { entries: AuditEntry[]; total: number };

import { t } from "../i18n/index.ts";
import { isTeamRole } from "../teams/types.ts";
import type { AuditEntry } from "./types.ts";

type Details = AuditEntry["details"];

/**
 * How each known action reads: its label and a one-line summary of its
 * details. Keys match the actions recorded in `supabase/migrations/`.
 */
const actions: Record<
  string,
  { label: string; summary: (d: Details) => string }
> = {
  "member.added": {
    label: t("audit.action.memberAdded"),
    summary: (d) =>
      t("audit.summary.memberAdded", { who: member(d), role: role(d.role) }),
  },
  "member.role_changed": {
    label: t("audit.action.memberRoleChanged"),
    summary: (d) =>
      t("audit.summary.memberRoleChanged", {
        who: member(d),
        from: role(d.from),
        to: role(d.to),
      }),
  },
  "member.removed": {
    label: t("audit.action.memberRemoved"),
    summary: (d) =>
      t("audit.summary.memberRemoved", { who: member(d), role: role(d.role) }),
  },
};

/**
 * An entry as German text: what happened, and to whom or what. Actions added
 * by later tickets show their stored key and details until they get a label.
 */
export function describeAuditEntry(
  entry: Pick<AuditEntry, "action" | "details">,
): { action: string; summary: string } {
  const known = actions[entry.action];
  if (!known) {
    return { action: entry.action, summary: plainDetails(entry.details) };
  }
  return { action: known.label, summary: known.summary(entry.details) };
}

/** Who acted: their address at the time, or the system (service role, SQL editor). */
export function actorName(entry: Pick<AuditEntry, "actorEmail">): string {
  return entry.actorEmail || t("audit.actorSystem");
}

function member(details: Details): string {
  return text(details.email) || t("audit.deletedAccount");
}

function role(value: unknown): string {
  const name = text(value);
  return isTeamRole(name) ? t(`teams.role.${name}`) : name;
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

function plainDetails(details: Details): string {
  return Object.entries(details)
    .map(
      ([key, value]) =>
        `${key}: ${typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}`,
    )
    .join(", ");
}

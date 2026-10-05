import { type MessageKey, t } from "../../lib/i18n/index.ts";
import type { TeamSummary } from "../../lib/teams/types.ts";

export type ModuleId = "forms" | "teams" | "audit";

export type DashboardModule = {
  id: ModuleId;
  href: `/${string}`;
  label: MessageKey;
  superAdminOnly?: true;
};

/** Modules in rail order. Settings (Super Admin) joins with ticket 20. */
export const modules: readonly DashboardModule[] = [
  { id: "forms", href: "/forms", label: "nav.forms" },
  { id: "teams", href: "/teams", label: "nav.teams" },
  {
    id: "audit",
    href: "/audit-log",
    label: "nav.auditLog",
    superAdminOnly: true,
  },
];

/** The rail's modules for this person. Pages check access themselves. */
export function visibleModules(
  isSuperAdmin: boolean,
): readonly DashboardModule[] {
  return modules.filter((module) => isSuperAdmin || !module.superAdminOnly);
}

export function activeModule(pathname: string): DashboardModule | undefined {
  return modules.find(
    (module) =>
      pathname === module.href || pathname.startsWith(`${module.href}/`),
  );
}

/** A team as the shell shows it in the sidebar and breadcrumbs. */
export type ShellTeam = Pick<TeamSummary, "id" | "name">;

export type Breadcrumb = { label: string; href?: string };

/**
 * Top bar crumbs: the module, then the team on a team page. Only teams the
 * person can see are named; anything else shows just the module.
 */
export function breadcrumbs(
  pathname: string,
  teams: readonly ShellTeam[],
): Breadcrumb[] {
  const module = activeModule(pathname);
  if (!module) return [];
  const label = t(module.label);
  if (pathname === module.href) return [{ label }];

  const crumbs: Breadcrumb[] = [{ label, href: module.href }];
  if (module.id === "teams") {
    const id = pathname.slice(`${module.href}/`.length).split("/")[0];
    const team = teams.find((candidate) => candidate.id === id);
    if (team) crumbs.push({ label: team.name });
  }
  return crumbs;
}

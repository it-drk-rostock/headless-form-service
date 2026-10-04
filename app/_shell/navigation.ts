import type { MessageKey } from "@/lib/i18n/index.ts";

export type ModuleId = "forms" | "teams";

export type DashboardModule = {
  id: ModuleId;
  href: `/${string}`;
  label: MessageKey;
};

/** Modules in rail order. Super Admin modules (audit log, settings) join once roles exist. */
export const modules: readonly DashboardModule[] = [
  { id: "forms", href: "/forms", label: "nav.forms" },
  { id: "teams", href: "/teams", label: "nav.teams" },
];

export function activeModule(pathname: string): DashboardModule | undefined {
  return modules.find(
    (module) =>
      pathname === module.href || pathname.startsWith(`${module.href}/`),
  );
}

import { requireProfile } from "@/lib/auth/profile.ts";
import { listMyTeams } from "@/lib/teams/queries.ts";
import { DashboardShell } from "../_shell/DashboardShell.tsx";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const [{ fullName, email, isSuperAdmin }, teams] = await Promise.all([
    requireProfile(),
    listMyTeams(),
  ]);
  return (
    <DashboardShell
      user={{ fullName, email }}
      isSuperAdmin={isSuperAdmin}
      teams={teams.map(({ id, name }) => ({ id, name }))}
    >
      {children}
    </DashboardShell>
  );
}

import { requireProfile } from "@/lib/auth/profile.ts";
import { DashboardShell } from "../_shell/DashboardShell.tsx";

export default async function DashboardLayout({ children }: LayoutProps<"/">) {
  const { fullName, email } = await requireProfile();
  return <DashboardShell user={{ fullName, email }}>{children}</DashboardShell>;
}

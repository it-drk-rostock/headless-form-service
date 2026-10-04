import { DashboardShell } from "../_shell/DashboardShell.tsx";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return <DashboardShell>{children}</DashboardShell>;
}

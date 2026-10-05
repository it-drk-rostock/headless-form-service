import { Text } from "@mantine/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parsePage } from "@/lib/audit/page.ts";
import { listAuditEntries } from "@/lib/audit/queries.ts";
import { requireProfile } from "@/lib/auth/profile.ts";
import { t } from "@/lib/i18n/index.ts";
import { AuditLog } from "../../_components/AuditLog.tsx";
import { ContentPanel } from "../../_components/ContentPanel.tsx";

export const metadata: Metadata = { title: t("audit.title") };

/**
 * The audit log of every team, for Super Admins. Team Admins read their
 * team's log on the team page; for everyone else this page does not exist.
 */
export default async function AuditLogPage({
  searchParams,
}: PageProps<"/audit-log">) {
  const profile = await requireProfile();
  if (!profile.isSuperAdmin) notFound();
  const page = parsePage((await searchParams).seite);
  const log = await listAuditEntries({ page });

  return (
    <ContentPanel title={t("audit.title")}>
      <Text fz={13} c="gray.6" mt={4}>
        {t("audit.intro")}
      </Text>
      <AuditLog log={log} page={page} basePath="/audit-log" showTeam />
    </ContentPanel>
  );
}

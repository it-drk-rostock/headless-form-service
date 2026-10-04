import { IconUsersGroup } from "@tabler/icons-react";
import type { Metadata } from "next";
import { t } from "@/lib/i18n/index.ts";
import { ContentPanel } from "../../_components/ContentPanel.tsx";
import { EmptyState } from "../../_components/EmptyState.tsx";

export const metadata: Metadata = { title: t("teams.title") };

export default function TeamsPage() {
  return (
    <ContentPanel title={t("teams.title")}>
      <EmptyState
        icon={<IconUsersGroup size={24} stroke={1.5} />}
        title={t("teams.emptyTitle")}
        hint={t("teams.emptyHint")}
      />
    </ContentPanel>
  );
}

import { IconUsersGroup } from "@tabler/icons-react";
import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth/profile.ts";
import { t } from "@/lib/i18n/index.ts";
import { listMyTeams } from "@/lib/teams/queries.ts";
import { ContentPanel } from "../../_components/ContentPanel.tsx";
import { EmptyState } from "../../_components/EmptyState.tsx";
import { CreateTeamButton } from "./TeamNameDrawer.tsx";
import { TeamsTable } from "./TeamsTable.tsx";

export const metadata: Metadata = { title: t("teams.title") };

export default async function TeamsPage() {
  const [profile, teams] = await Promise.all([requireProfile(), listMyTeams()]);

  return (
    <ContentPanel
      title={t("teams.title")}
      actions={profile.isSuperAdmin && <CreateTeamButton />}
    >
      {teams.length > 0 ? (
        <TeamsTable teams={teams} />
      ) : (
        <EmptyState
          icon={<IconUsersGroup size={24} stroke={1.5} />}
          title={t("teams.emptyTitle")}
          hint={t(
            profile.isSuperAdmin
              ? "teams.emptyHintSuperAdmin"
              : "teams.emptyHint",
          )}
        />
      )}
    </ContentPanel>
  );
}

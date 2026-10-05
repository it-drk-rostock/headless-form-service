import { IconForms } from "@tabler/icons-react";
import type { Metadata } from "next";
import { listMyForms } from "@/lib/forms/queries.ts";
import { t } from "@/lib/i18n/index.ts";
import { listMyTeams } from "@/lib/teams/queries.ts";
import { ContentPanel } from "../../_components/ContentPanel.tsx";
import { EmptyState } from "../../_components/EmptyState.tsx";
import { CreateFormButton } from "./CreateFormDrawer.tsx";
import { FormsTable } from "./FormsTable.tsx";

export const metadata: Metadata = { title: t("forms.title") };

/** The forms of all the person's teams (all teams for a Super Admin), archived ones excluded. */
export default async function FormsPage() {
  const [teams, forms] = await Promise.all([listMyTeams(), listMyForms()]);

  return (
    <ContentPanel
      title={t("forms.title")}
      actions={
        teams.length > 0 && (
          <CreateFormButton
            teams={teams.map(({ id, name }) => ({ id, name }))}
          />
        )
      }
    >
      {forms.length > 0 ? (
        <FormsTable forms={forms} />
      ) : (
        <EmptyState
          icon={<IconForms size={24} stroke={1.5} />}
          title={t("forms.emptyTitle")}
          hint={t(
            teams.length > 0 ? "forms.emptyHint" : "forms.emptyHintNoTeam",
          )}
        />
      )}
    </ContentPanel>
  );
}

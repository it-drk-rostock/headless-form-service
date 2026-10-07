import { Group } from "@mantine/core";
import { IconArchive, IconForms } from "@tabler/icons-react";
import type { Metadata } from "next";
import { listMyForms } from "@/lib/forms/queries.ts";
import { formsFilter } from "@/lib/forms/types.ts";
import { t } from "@/lib/i18n/index.ts";
import { listMyTeams } from "@/lib/teams/queries.ts";
import { ContentPanel } from "../../_components/ContentPanel.tsx";
import { EmptyState } from "../../_components/EmptyState.tsx";
import { CreateFormButton } from "./CreateFormDrawer.tsx";
import { FormsFilterControl } from "./FormsFilterControl.tsx";
import { FormsTable } from "./FormsTable.tsx";

export const metadata: Metadata = { title: t("forms.title") };

/**
 * The forms of all the person's teams (all teams for a Super Admin): those
 * in use, or with `?filter=archived` the archived ones.
 */
export default async function FormsPage({ searchParams }: PageProps<"/forms">) {
  const filter = formsFilter((await searchParams).filter);
  const [teams, forms] = await Promise.all([
    listMyTeams(),
    listMyForms(filter),
  ]);

  return (
    <ContentPanel
      title={t("forms.title")}
      actions={
        <Group gap="sm" wrap="nowrap">
          <FormsFilterControl filter={filter} />
          {teams.length > 0 && (
            <CreateFormButton
              teams={teams.map(({ id, name }) => ({ id, name }))}
            />
          )}
        </Group>
      }
    >
      {forms.length > 0 ? (
        <FormsTable forms={forms} />
      ) : filter === "archived" ? (
        <EmptyState
          icon={<IconArchive size={24} stroke={1.5} />}
          title={t("forms.archivedEmptyTitle")}
          hint={t("forms.archivedEmptyHint")}
        />
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

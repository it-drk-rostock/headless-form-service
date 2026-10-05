import { IconUsersGroup } from "@tabler/icons-react";
import { t } from "@/lib/i18n/index.ts";
import { ContentPanel } from "../../../_components/ContentPanel.tsx";
import { EmptyState } from "../../../_components/EmptyState.tsx";

/** Same answer whether the team is missing or belongs to others, so IDs reveal nothing. */
export default function TeamNotFound() {
  return (
    <ContentPanel title={t("teams.title")}>
      <EmptyState
        icon={<IconUsersGroup size={24} stroke={1.5} />}
        title={t("teams.notFoundTitle")}
        hint={t("teams.notFoundHint")}
      />
    </ContentPanel>
  );
}

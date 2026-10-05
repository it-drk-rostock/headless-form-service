import { IconForms } from "@tabler/icons-react";
import { t } from "@/lib/i18n/index.ts";
import { ContentPanel } from "../../../_components/ContentPanel.tsx";
import { EmptyState } from "../../../_components/EmptyState.tsx";

/** Same answer whether the form is missing or belongs to another team, so IDs reveal nothing. */
export default function FormNotFound() {
  return (
    <ContentPanel title={t("forms.title")}>
      <EmptyState
        icon={<IconForms size={24} stroke={1.5} />}
        title={t("forms.notFoundTitle")}
        hint={t("forms.notFoundHint")}
      />
    </ContentPanel>
  );
}

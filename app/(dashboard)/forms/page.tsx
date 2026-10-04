import { IconForms } from "@tabler/icons-react";
import type { Metadata } from "next";
import { t } from "@/lib/i18n/index.ts";
import { ContentPanel } from "../../_components/ContentPanel.tsx";
import { EmptyState } from "../../_components/EmptyState.tsx";

export const metadata: Metadata = { title: t("forms.title") };

export default function FormsPage() {
  return (
    <ContentPanel title={t("forms.title")}>
      <EmptyState
        icon={<IconForms size={24} stroke={1.5} />}
        title={t("forms.emptyTitle")}
        hint={t("forms.emptyHint")}
      />
    </ContentPanel>
  );
}

"use client";

import { Box, Group, SegmentedControl } from "@mantine/core";
import { useState } from "react";
import { FORM_VIEWS, type FormView } from "@/lib/forms/types.ts";
import { type MessageKey, t } from "@/lib/i18n/index.ts";
import { ContentPanel } from "../../../_components/ContentPanel.tsx";

const labels: Record<FormView, MessageKey> = {
  designer: "forms.viewDesigner",
  email: "forms.viewEmail",
  versions: "forms.viewVersions",
  settings: "forms.viewSettings",
  embed: "forms.viewEmbed",
  passes: "forms.viewPasses",
  statistics: "forms.viewStatistics",
  failures: "forms.viewFailures",
};

/**
 * A form's page with its views (ui-design §5: view tabs top right). A view
 * is mounted when first shown (Creator measures its layout on mount) and
 * then stays mounted, so switching never loses unsaved designer changes.
 * The URL follows the view, so a reload or a shared link opens it again.
 * A view's `actions` sit left of the view tabs; `status` shows under the
 * title in every view.
 */
export function FormViews({
  title,
  subtitle,
  initialView,
  actions,
  status,
  views,
}: {
  title: string;
  subtitle: string;
  initialView: FormView;
  actions: Partial<Record<FormView, React.ReactNode>>;
  status: React.ReactNode;
  views: Record<FormView, React.ReactNode>;
}) {
  const [view, setView] = useState(initialView);
  const [shown, setShown] = useState<FormView[]>([initialView]);

  function show(next: FormView) {
    setView(next);
    if (!shown.includes(next)) setShown([...shown, next]);
    const url = new URL(window.location.href);
    if (next === FORM_VIEWS[0]) url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
  }

  return (
    <ContentPanel
      title={title}
      subtitle={subtitle}
      actions={
        <Group gap="sm" wrap="nowrap">
          {actions[view]}
          <SegmentedControl
            size="xs"
            value={view}
            onChange={(value) => show(value as FormView)}
            data={FORM_VIEWS.map((value) => ({
              value,
              label: t(labels[value]),
            }))}
          />
        </Group>
      }
    >
      <Box mt="sm">{status}</Box>
      {shown.map((key) => (
        <Box key={key} display={key === view ? undefined : "none"}>
          {views[key]}
        </Box>
      ))}
    </ContentPanel>
  );
}

"use client";

import { ActionIcon, Breadcrumbs, Group, Text } from "@mantine/core";
import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import { t } from "@/lib/i18n/index.ts";
import type { DashboardModule } from "./navigation.ts";

export function TopBar({
  module,
  sidebarHidden,
  onShowSidebar,
}: {
  module: DashboardModule | undefined;
  /** The sidebar is collapsed on desktop. On narrow screens it always lives in a drawer. */
  sidebarHidden: boolean;
  onShowSidebar: () => void;
}) {
  return (
    <Group h="100%" px="md" gap="sm" wrap="nowrap">
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={onShowSidebar}
        aria-label={t("nav.showSidebar")}
        hiddenFrom={sidebarHidden ? undefined : "md"}
      >
        <IconLayoutSidebarLeftExpand size={18} stroke={1.5} />
      </ActionIcon>
      <Breadcrumbs aria-label={t("nav.breadcrumbsLabel")}>
        {module && <Text>{t(module.label)}</Text>}
      </Breadcrumbs>
    </Group>
  );
}

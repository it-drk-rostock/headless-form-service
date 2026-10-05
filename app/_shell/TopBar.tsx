"use client";

import { ActionIcon, Anchor, Breadcrumbs, Group, Text } from "@mantine/core";
import { IconLayoutSidebarLeftExpand } from "@tabler/icons-react";
import Link from "next/link";
import { t } from "@/lib/i18n/index.ts";
import type { Breadcrumb } from "./navigation.ts";

export function TopBar({
  crumbs,
  sidebarHidden,
  onShowSidebar,
}: {
  crumbs: Breadcrumb[];
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
        {crumbs.map((crumb, index) =>
          // Every crumb but the last links back, in gray (ui-design §4.3).
          crumb.href && index < crumbs.length - 1 ? (
            <Anchor
              key={crumb.href}
              component={Link}
              href={crumb.href}
              c="gray.6"
              fz="sm"
            >
              {crumb.label}
            </Anchor>
          ) : (
            <Text key={crumb.label} truncate>
              {crumb.label}
            </Text>
          ),
        )}
      </Breadcrumbs>
    </Group>
  );
}

"use client";

import {
  ActionIcon,
  Box,
  Collapse,
  Group,
  NavLink,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconChevronDown,
  IconChevronRight,
  IconFiles,
  IconLayoutSidebarLeftCollapse,
  IconUsers,
} from "@tabler/icons-react";
import Link from "next/link";
import { t } from "@/lib/i18n/index.ts";
import classes from "./DashboardShell.module.css";
import type { ModuleId } from "./navigation.ts";

export function ModuleSidebar({
  activeId,
  pathname,
  onHide,
  onNavigate,
}: {
  activeId: ModuleId | undefined;
  pathname: string;
  onHide: () => void;
  /** Called when an item is clicked, so the narrow-screen drawer can close. */
  onNavigate?: () => void;
}) {
  return (
    <Box className={classes.sidebar}>
      <Group
        className={classes.sidebarHeader}
        justify="space-between"
        wrap="nowrap"
      >
        <Group gap={4} wrap="nowrap">
          <Text fw={600}>{t("org.name")}</Text>
          <IconChevronDown size={16} stroke={1.5} />
        </Group>
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={onHide}
          aria-label={t("nav.hideSidebar")}
        >
          <IconLayoutSidebarLeftCollapse size={18} stroke={1.5} />
        </ActionIcon>
      </Group>
      <Box p="xs">
        {activeId === "teams" ? (
          <SidebarItem
            href="/teams"
            label={t("nav.allTeams")}
            icon={<IconUsers size={16} stroke={1.5} />}
            pathname={pathname}
            onClick={onNavigate}
          />
        ) : (
          <>
            <SidebarItem
              href="/forms"
              label={t("nav.allForms")}
              icon={<IconFiles size={16} stroke={1.5} />}
              pathname={pathname}
              onClick={onNavigate}
            />
            <SidebarSection label={t("nav.sectionTeams")}>
              <Text c="gray.6" px="sm" py={6}>
                {t("nav.noTeams")}
              </Text>
            </SidebarSection>
          </>
        )}
      </Box>
    </Box>
  );
}

function SidebarItem({
  href,
  label,
  icon,
  pathname,
  onClick,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  pathname: string;
  onClick?: () => void;
}) {
  const active = pathname === href;
  return (
    <NavLink
      component={Link}
      href={href}
      label={label}
      leftSection={icon}
      active={active}
      aria-current={active ? "page" : undefined}
      className={classes.sidebarItem}
      onClick={onClick}
    />
  );
}

function SidebarSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [expanded, { toggle }] = useDisclosure(true);
  return (
    <Box mt="md">
      <UnstyledButton
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={t("nav.toggleSection")}
        className={classes.sectionLabel}
      >
        <span>{label}</span>
        {expanded ? (
          <IconChevronDown size={14} stroke={1.5} />
        ) : (
          <IconChevronRight size={14} stroke={1.5} />
        )}
      </UnstyledButton>
      <Collapse expanded={expanded}>{children}</Collapse>
    </Box>
  );
}

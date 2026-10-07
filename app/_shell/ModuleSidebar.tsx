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
  IconHistory,
  IconLayoutSidebarLeftCollapse,
  IconSettings,
  IconUsers,
  IconUsersGroup,
} from "@tabler/icons-react";
import Link from "next/link";
import { t } from "@/lib/i18n/index.ts";
import classes from "./DashboardShell.module.css";
import type { ModuleId, ShellTeam } from "./navigation.ts";

export function ModuleSidebar({
  activeId,
  pathname,
  teams,
  onHide,
  onNavigate,
}: {
  activeId: ModuleId | undefined;
  pathname: string;
  teams: ShellTeam[];
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
        {activeId === "settings" ? (
          <SidebarItem
            href="/settings"
            label={t("nav.generalSettings")}
            icon={<IconSettings size={16} stroke={1.5} />}
            pathname={pathname}
            onClick={onNavigate}
          />
        ) : activeId === "audit" ? (
          <SidebarItem
            href="/audit-log"
            label={t("nav.allAuditEntries")}
            icon={<IconHistory size={16} stroke={1.5} />}
            pathname={pathname}
            onClick={onNavigate}
          />
        ) : activeId === "teams" ? (
          <SidebarItem
            href="/teams"
            label={t("nav.allTeams")}
            icon={<IconUsers size={16} stroke={1.5} />}
            pathname={pathname}
            onClick={onNavigate}
          />
        ) : (
          <SidebarItem
            href="/forms"
            label={t("nav.allForms")}
            icon={<IconFiles size={16} stroke={1.5} />}
            pathname={pathname}
            onClick={onNavigate}
          />
        )}
        <SidebarSection label={t("nav.sectionTeams")}>
          {teams.length > 0 ? (
            teams.map((team) => (
              <SidebarItem
                key={team.id}
                href={`/teams/${team.id}`}
                label={team.name}
                icon={<IconUsersGroup size={16} stroke={1.5} />}
                pathname={pathname}
                onClick={onNavigate}
              />
            ))
          ) : (
            <Text c="gray.6" px="sm" py={8}>
              {t("nav.noTeams")}
            </Text>
          )}
        </SidebarSection>
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

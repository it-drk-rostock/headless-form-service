"use client";

import { Box, Stack, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconForms,
  IconHistory,
  IconSettings,
  IconUsersGroup,
} from "@tabler/icons-react";
import Link from "next/link";
import { t } from "@/lib/i18n/index.ts";
import { LogoTile } from "../_components/LogoTile.tsx";
import classes from "./DashboardShell.module.css";
import {
  type DashboardModule,
  type ModuleId,
  visibleModules,
} from "./navigation.ts";
import { type ShellUser, UserMenu } from "./UserMenu.tsx";

const moduleIcons: Record<ModuleId, typeof IconForms> = {
  forms: IconForms,
  teams: IconUsersGroup,
  audit: IconHistory,
  settings: IconSettings,
};

export function IconRail({
  activeId,
  width,
  user,
  isSuperAdmin,
}: {
  activeId: ModuleId | undefined;
  width: number;
  user: ShellUser;
  isSuperAdmin: boolean;
}) {
  const modules = visibleModules(isSuperAdmin);
  return (
    <Stack
      component="nav"
      aria-label={t("nav.mainLabel")}
      className={classes.rail}
      w={width}
      align="center"
      gap="xs"
      py="sm"
    >
      <Box mb="sm">
        <LogoTile />
      </Box>
      {modules
        .filter((module) => !module.atBottom)
        .map((module) => (
          <RailItem key={module.id} module={module} activeId={activeId} />
        ))}
      <Stack mt="auto" align="center" gap="xs">
        {modules
          .filter((module) => module.atBottom)
          .map((module) => (
            <RailItem key={module.id} module={module} activeId={activeId} />
          ))}
        <UserMenu user={user} />
      </Stack>
    </Stack>
  );
}

function RailItem({
  module,
  activeId,
}: {
  module: DashboardModule;
  activeId: ModuleId | undefined;
}) {
  const Icon = moduleIcons[module.id];
  const label = t(module.label);
  return (
    <Tooltip label={label} position="right" withArrow>
      <UnstyledButton
        component={Link}
        href={module.href}
        aria-label={label}
        aria-current={module.id === activeId ? "page" : undefined}
        className={classes.railItem}
      >
        <Icon size={18} stroke={1.5} />
      </UnstyledButton>
    </Tooltip>
  );
}

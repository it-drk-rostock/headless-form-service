"use client";

import { Box, Stack, Tooltip, UnstyledButton } from "@mantine/core";
import { IconForms, IconUsersGroup } from "@tabler/icons-react";
import Link from "next/link";
import { t } from "@/lib/i18n/index.ts";
import { LogoTile } from "../_components/LogoTile.tsx";
import classes from "./DashboardShell.module.css";
import { type ModuleId, modules } from "./navigation.ts";
import { type ShellUser, UserMenu } from "./UserMenu.tsx";

const moduleIcons: Record<ModuleId, typeof IconForms> = {
  forms: IconForms,
  teams: IconUsersGroup,
};

export function IconRail({
  activeId,
  width,
  user,
}: {
  activeId: ModuleId | undefined;
  width: number;
  user: ShellUser;
}) {
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
      {modules.map((module) => {
        const Icon = moduleIcons[module.id];
        const label = t(module.label);
        return (
          <Tooltip key={module.id} label={label} position="right" withArrow>
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
      })}
      <Box mt="auto">
        <UserMenu user={user} />
      </Box>
    </Stack>
  );
}

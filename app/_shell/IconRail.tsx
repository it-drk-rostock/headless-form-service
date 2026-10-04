"use client";

import { Box, Stack, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { IconForms, IconUsersGroup } from "@tabler/icons-react";
import Link from "next/link";
import { t } from "@/lib/i18n/index.ts";
import classes from "./DashboardShell.module.css";
import { type ModuleId, modules } from "./navigation.ts";

const moduleIcons: Record<ModuleId, typeof IconForms> = {
  forms: IconForms,
  teams: IconUsersGroup,
};

export function IconRail({
  activeId,
  width,
}: {
  activeId: ModuleId | undefined;
  width: number;
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
      <Box className={classes.logoTile} mb="sm">
        <Text c="white" fw={600} fz={11}>
          {t("app.logoTile")}
        </Text>
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
    </Stack>
  );
}

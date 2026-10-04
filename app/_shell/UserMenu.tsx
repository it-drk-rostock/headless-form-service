"use client";

import { Avatar, Menu, Text, UnstyledButton } from "@mantine/core";
import { IconLogout } from "@tabler/icons-react";
import { signOut } from "@/lib/auth/actions.ts";
import type { Profile } from "@/lib/auth/profile.ts";
import { t } from "@/lib/i18n/index.ts";
import { initials } from "./initials.ts";

export type ShellUser = Pick<Profile, "fullName" | "email">;

/** Avatar at the bottom of the icon rail (docs/ui-design.md §4); its menu holds *Abmelden*. */
export function UserMenu({ user }: { user: ShellUser }) {
  return (
    <Menu position="right-end" withArrow shadow="md" width={220}>
      <Menu.Target>
        <UnstyledButton aria-label={t("user.menuLabel")}>
          <Avatar color="gray" radius="xl" size={32}>
            {initials(user.fullName, user.email)}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          {user.fullName && (
            <Text fz="sm" c="dark.7" fw={500} truncate>
              {user.fullName}
            </Text>
          )}
          <Text fz={13} c="gray.6" truncate>
            {user.email}
          </Text>
        </Menu.Label>
        <Menu.Divider />
        <form action={signOut}>
          <Menu.Item
            component="button"
            type="submit"
            leftSection={<IconLogout size={16} stroke={1.5} />}
          >
            {t("user.signOut")}
          </Menu.Item>
        </form>
      </Menu.Dropdown>
    </Menu>
  );
}

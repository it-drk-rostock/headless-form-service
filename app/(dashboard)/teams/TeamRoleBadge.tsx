import { Badge, Text } from "@mantine/core";
import { t } from "@/lib/i18n/index.ts";
import type { TeamRole } from "@/lib/teams/types.ts";

/** The person's role in a team. Grey, since red is reserved for the brand (ui-design §2.3). */
export function TeamRoleBadge({ role }: { role: TeamRole | null }) {
  if (!role) {
    return (
      <Text fz={13} c="gray.6">
        {t("teams.roleNone")}
      </Text>
    );
  }
  return (
    <Badge variant="light" color="gray" radius="xl" tt="none" fw={500}>
      {t(`teams.role.${role}`)}
    </Badge>
  );
}

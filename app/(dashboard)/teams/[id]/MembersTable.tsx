"use client";

import {
  ActionIcon,
  Badge,
  Group,
  Menu,
  MenuDivider,
  MenuDropdown,
  MenuItem,
  MenuTarget,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";
import {
  IconDots,
  IconKey,
  IconShieldCheck,
  IconUser,
  IconUserMinus,
} from "@tabler/icons-react";
import { useState } from "react";
import { formatDate, t } from "@/lib/i18n/index.ts";
import { type Member, memberName } from "@/lib/members/types.ts";
import { TeamRoleBadge } from "../TeamRoleBadge.tsx";
import { type MemberAction, MemberActionModal } from "./MemberActionModal.tsx";

/**
 * A team's members as a plain table (ui-design §5). People who may manage
 * the team get a `⋯` menu per row; everyone else only sees the list.
 */
export function MembersTable({
  teamId,
  members,
  viewerId,
  viewerIsSuperAdmin,
  canManage,
}: {
  teamId: string;
  members: Member[];
  viewerId: string;
  viewerIsSuperAdmin: boolean;
  canManage: boolean;
}) {
  const [action, setAction] = useState<MemberAction | null>(null);
  const teamAdminCount = members.filter((m) => m.role === "team_admin").length;

  return (
    <>
      <Table highlightOnHover verticalSpacing="sm" fz={13} mt="sm">
        <TableThead>
          <TableTr>
            <TableTh c="gray.6" fw={500}>
              {t("members.columnName")}
            </TableTh>
            <TableTh c="gray.6" fw={500}>
              {t("members.columnEmail")}
            </TableTh>
            <TableTh c="gray.6" fw={500}>
              {t("members.columnRole")}
            </TableTh>
            <TableTh c="gray.6" fw={500}>
              {t("members.columnSince")}
            </TableTh>
            {canManage && <TableTh w={48} />}
          </TableTr>
        </TableThead>
        <TableTbody>
          {members.map((member) => (
            <TableTr key={member.userId}>
              <TableTd>
                <Group gap="xs" wrap="nowrap">
                  <Text fz={13}>{memberName(member)}</Text>
                  {member.userId === viewerId && (
                    <Badge
                      variant="outline"
                      color="gray"
                      size="xs"
                      radius="xl"
                      tt="none"
                      fw={500}
                    >
                      {t("members.you")}
                    </Badge>
                  )}
                </Group>
              </TableTd>
              <TableTd>
                <Text fz={13} c="gray.6">
                  {member.email}
                </Text>
              </TableTd>
              <TableTd>
                <TeamRoleBadge role={member.role} />
              </TableTd>
              <TableTd>
                <Text fz={13} c="gray.6">
                  {formatDate(member.since)}
                </Text>
              </TableTd>
              {canManage && (
                <TableTd>
                  <MemberMenu
                    member={member}
                    onSelect={(kind) => setAction({ kind, member })}
                  />
                </TableTd>
              )}
            </TableTr>
          ))}
        </TableTbody>
      </Table>
      {canManage && (
        <MemberActionModal
          teamId={teamId}
          action={action}
          isLastTeamAdmin={
            action?.member.role === "team_admin" && teamAdminCount === 1
          }
          isSelf={action?.member.userId === viewerId}
          viewerIsSuperAdmin={viewerIsSuperAdmin}
          onClose={() => setAction(null)}
        />
      )}
    </>
  );
}

function MemberMenu({
  member,
  onSelect,
}: {
  member: Member;
  onSelect: (kind: MemberAction["kind"]) => void;
}) {
  return (
    <Menu position="bottom-end" shadow="md" width={240}>
      <MenuTarget>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t("members.actionsLabel", { name: memberName(member) })}
        >
          <IconDots size={16} stroke={1.5} />
        </ActionIcon>
      </MenuTarget>
      <MenuDropdown>
        {member.role === "member" ? (
          <MenuItem
            leftSection={<IconShieldCheck size={16} stroke={1.5} />}
            onClick={() => onSelect("makeAdmin")}
          >
            {t("members.makeAdmin")}
          </MenuItem>
        ) : (
          <MenuItem
            leftSection={<IconUser size={16} stroke={1.5} />}
            onClick={() => onSelect("makeMember")}
          >
            {t("members.makeMember")}
          </MenuItem>
        )}
        <MenuItem
          leftSection={<IconKey size={16} stroke={1.5} />}
          onClick={() => onSelect("passwordLink")}
        >
          {t("members.sendPasswordLink")}
        </MenuItem>
        <MenuDivider />
        <MenuItem
          color="red"
          leftSection={<IconUserMinus size={16} stroke={1.5} />}
          onClick={() => onSelect("remove")}
        >
          {t("members.remove")}
        </MenuItem>
      </MenuDropdown>
    </Menu>
  );
}

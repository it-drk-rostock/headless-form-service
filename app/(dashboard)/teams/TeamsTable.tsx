"use client";

import {
  Anchor,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";
import Link from "next/link";
import { formatDate, t } from "@/lib/i18n/index.ts";
import type { TeamSummary } from "@/lib/teams/types.ts";
import { TeamRoleBadge } from "./TeamRoleBadge.tsx";

/** Teams as a plain table (ui-design §5): no stripes, thin dividers, row hover. */
export function TeamsTable({ teams }: { teams: TeamSummary[] }) {
  return (
    <Table highlightOnHover verticalSpacing="sm" fz={13} mt="lg">
      <TableThead>
        <TableTr>
          <TableTh c="gray.6" fw={500}>
            {t("teams.columnName")}
          </TableTh>
          <TableTh c="gray.6" fw={500}>
            {t("teams.columnRole")}
          </TableTh>
          <TableTh c="gray.6" fw={500}>
            {t("teams.columnCreated")}
          </TableTh>
        </TableTr>
      </TableThead>
      <TableTbody>
        {teams.map((team) => (
          <TableTr key={team.id}>
            <TableTd>
              <Anchor component={Link} href={`/teams/${team.id}`} fz={13}>
                {team.name}
              </Anchor>
            </TableTd>
            <TableTd>
              <TeamRoleBadge role={team.role} />
            </TableTd>
            <TableTd>
              <Text fz={13} c="gray.6">
                {formatDate(team.createdAt)}
              </Text>
            </TableTd>
          </TableTr>
        ))}
      </TableTbody>
    </Table>
  );
}

"use client";

import {
  Button,
  Group,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import Link from "next/link";
import { actorName, describeAuditEntry } from "@/lib/audit/describe.ts";
import { pageCount } from "@/lib/audit/page.ts";
import type { AuditPage } from "@/lib/audit/types.ts";
import { formatDateTime, t } from "@/lib/i18n/index.ts";

/**
 * One page of audit log entries as a plain, read-only table (ui-design §5),
 * newest first, with links to newer and older pages (`?seite=`). The team
 * column is for the cross-team log; a team's page leaves it out.
 */
export function AuditLog({
  log,
  page,
  basePath,
  anchor,
  showTeam,
}: {
  log: AuditPage;
  page: number;
  /** The page this log is on; page links add `?seite=` and `#anchor`. */
  basePath: string;
  anchor?: string;
  showTeam: boolean;
}) {
  const pages = pageCount(log.total);
  const href = (target: number) =>
    `${basePath}${target === 1 ? "" : `?seite=${target}`}${anchor ? `#${anchor}` : ""}`;

  return (
    <>
      {log.entries.length > 0 ? (
        <AuditTable entries={log.entries} showTeam={showTeam} />
      ) : (
        <Text fz={13} c="gray.6" mt="sm">
          {t("audit.empty")}
        </Text>
      )}
      {(pages > 1 || page > 1) && (
        <Group justify="space-between" mt="md">
          {/* Past the last page, "newer" leads back to the last one. */}
          <PageLink
            href={page > 1 ? href(Math.min(page - 1, pages)) : null}
            leftSection={<IconChevronLeft size={14} stroke={1.5} />}
          >
            {t("audit.newer")}
          </PageLink>
          <Text fz={13} c="gray.6">
            {t("audit.pageOf", { page, pages })}
          </Text>
          <PageLink
            href={page < pages ? href(page + 1) : null}
            rightSection={<IconChevronRight size={14} stroke={1.5} />}
          >
            {t("audit.older")}
          </PageLink>
        </Group>
      )}
    </>
  );
}

function AuditTable({
  entries,
  showTeam,
}: {
  entries: AuditPage["entries"];
  showTeam: boolean;
}) {
  return (
    <Table highlightOnHover verticalSpacing="sm" fz={13} mt="sm">
      <TableThead>
        <TableTr>
          <TableTh c="gray.6" fw={500}>
            {t("audit.columnTime")}
          </TableTh>
          {showTeam && (
            <TableTh c="gray.6" fw={500}>
              {t("audit.columnTeam")}
            </TableTh>
          )}
          <TableTh c="gray.6" fw={500}>
            {t("audit.columnActor")}
          </TableTh>
          <TableTh c="gray.6" fw={500}>
            {t("audit.columnAction")}
          </TableTh>
          <TableTh c="gray.6" fw={500}>
            {t("audit.columnDetails")}
          </TableTh>
        </TableTr>
      </TableThead>
      <TableTbody>
        {entries.map((entry) => {
          const { action, summary } = describeAuditEntry(entry);
          return (
            <TableTr key={entry.id}>
              <TableTd>
                <Text fz={13} c="gray.6" style={{ whiteSpace: "nowrap" }}>
                  {formatDateTime(entry.createdAt)}
                </Text>
              </TableTd>
              {showTeam && (
                <TableTd>
                  <Text fz={13}>
                    {entry.teamId
                      ? (entry.teamName ?? t("audit.deletedTeam"))
                      : t("audit.noTeam")}
                  </Text>
                </TableTd>
              )}
              <TableTd>
                <Text fz={13}>{actorName(entry)}</Text>
              </TableTd>
              <TableTd>
                <Text fz={13}>{action}</Text>
              </TableTd>
              <TableTd>
                <Text fz={13} c="gray.6">
                  {summary}
                </Text>
              </TableTd>
            </TableTr>
          );
        })}
      </TableTbody>
    </Table>
  );
}

/** A link to another page of the log, or a disabled button when there is none. */
function PageLink({
  href,
  children,
  ...sections
}: {
  href: string | null;
  children: React.ReactNode;
  leftSection?: React.ReactNode;
  rightSection?: React.ReactNode;
}) {
  if (href === null) {
    return (
      <Button variant="default" size="xs" disabled {...sections}>
        {children}
      </Button>
    );
  }
  return (
    <Button
      component={Link}
      href={href}
      variant="default"
      size="xs"
      {...sections}
    >
      {children}
    </Button>
  );
}

"use client";

import {
  Alert,
  Badge,
  Box,
  Group,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";
import { IconHistory, IconInfoCircle } from "@tabler/icons-react";
import type { FormVersion } from "@/lib/forms/publish.ts";
import { formatDateTime, t } from "@/lib/i18n/index.ts";
import { EmptyState } from "../../../_components/EmptyState.tsx";
import { RestoreButton } from "./DraftReset.tsx";

/**
 * The version history: every form version, newest first, with who published
 * it, when and its changelog. Any version can be restored into the draft.
 */
export function VersionHistory({
  formId,
  versions,
  currentVersion,
}: {
  formId: string;
  versions: FormVersion[];
  currentVersion: number | null;
}) {
  if (versions.length === 0 || currentVersion === null) {
    return (
      <EmptyState
        icon={<IconHistory size={24} stroke={1.5} />}
        title={t("forms.versionsEmptyTitle")}
        hint={t("forms.versionsEmptyHint")}
      />
    );
  }

  return (
    <Box mt="xl">
      <Alert
        variant="outline"
        color="gray"
        icon={<IconInfoCircle size={16} stroke={1.5} />}
        py={6}
      >
        <Text fz={13}>{t("forms.versionsHint")}</Text>
      </Alert>
      <Table verticalSpacing="sm" fz={13} mt="lg">
        <TableThead>
          <TableTr>
            <TableTh c="gray.6" fw={500}>
              {t("forms.columnVersion")}
            </TableTh>
            <TableTh c="gray.6" fw={500}>
              {t("forms.columnPublishedAt")}
            </TableTh>
            <TableTh c="gray.6" fw={500}>
              {t("forms.columnPublishedBy")}
            </TableTh>
            <TableTh c="gray.6" fw={500}>
              {t("forms.columnChangelog")}
            </TableTh>
            <TableTh />
          </TableTr>
        </TableThead>
        <TableTbody>
          {versions.map((version) => (
            <TableTr key={version.version}>
              <TableTd>
                <Group gap="xs" wrap="nowrap">
                  <Text fz={13} fw={500}>
                    {t("forms.version", { version: version.version })}
                  </Text>
                  {version.version === currentVersion && (
                    <Badge
                      variant="dot"
                      color="green"
                      radius="xl"
                      tt="none"
                      fw={500}
                    >
                      {t("forms.versionCurrent")}
                    </Badge>
                  )}
                </Group>
              </TableTd>
              <TableTd>
                <Text fz={13} c="gray.6">
                  {formatDateTime(version.publishedAt)}
                </Text>
              </TableTd>
              <TableTd>
                <Text fz={13}>
                  {version.publishedBy ?? t("forms.versionPublisherUnknown")}
                </Text>
              </TableTd>
              <TableTd maw={360}>
                {version.changelog ? (
                  <Text fz={13} style={{ whiteSpace: "pre-line" }}>
                    {version.changelog}
                  </Text>
                ) : (
                  <Text fz={13} c="gray.6">
                    {t("forms.versionNoChangelog")}
                  </Text>
                )}
              </TableTd>
              <TableTd ta="right">
                {/* The current version comes back by discarding changes. */}
                {version.version !== currentVersion && (
                  <RestoreButton
                    formId={formId}
                    version={version.version}
                    currentVersion={currentVersion}
                  />
                )}
              </TableTd>
            </TableTr>
          ))}
        </TableTbody>
      </Table>
    </Box>
  );
}

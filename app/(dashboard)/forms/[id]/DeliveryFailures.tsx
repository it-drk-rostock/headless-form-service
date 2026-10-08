"use client";

import {
  Alert,
  Badge,
  Box,
  Button,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconClockHour4,
  IconInfoCircle,
  IconMailCheck,
  IconRefresh,
} from "@tabler/icons-react";
import { useState, useTransition } from "react";
import {
  type DeliveryRetryResult,
  retryFormDelivery,
} from "@/lib/forms/actions.ts";
import {
  type DeliveryFailure,
  DLQ_RETENTION_DAYS,
} from "@/lib/forms/delivery-failures.ts";
import { formatDateTime, type MessageKey, t } from "@/lib/i18n/index.ts";
import { EmptyState } from "../../../_components/EmptyState.tsx";
import { FormError } from "../../../_components/FormError.tsx";

// A failure is an error: red with an icon and explicit text. One queued
// again needs attention until it is sent (ui-design §2.3).
const statusBadges = {
  failed: {
    color: "red",
    icon: IconAlertTriangle,
    label: "forms.failureStatus.failed",
  },
  in_progress: {
    color: "orange",
    icon: IconClockHour4,
    label: "forms.failureStatus.in_progress",
  },
} as const;

/**
 * The *Zustellfehler* view: the form's submissions whose notification email
 * could not be sent after all retries, newest first, with submission time,
 * version and reason, never the answers. Each can be retried while QStash
 * still keeps its message; otherwise the row says why not. A retried one
 * stays listed as being delivered again until it is sent.
 */
export function DeliveryFailures({
  failures,
}: {
  failures: DeliveryFailure[];
}) {
  return (
    <Box mt={40}>
      <Title order={2} fz={16}>
        {t("forms.failuresTitle")}
      </Title>
      <Alert
        variant="outline"
        color="gray"
        icon={<IconInfoCircle size={16} stroke={1.5} />}
        py={6}
        mt="sm"
      >
        <Text fz={13}>
          {t("forms.failuresHint", { days: DLQ_RETENTION_DAYS })}
        </Text>
      </Alert>
      {failures.length === 0 ? (
        <EmptyState
          icon={<IconMailCheck size={24} stroke={1.5} />}
          title={t("forms.failuresEmptyTitle")}
          hint={t("forms.failuresEmptyHint")}
        />
      ) : (
        <FailureTable failures={failures} />
      )}
    </Box>
  );
}

function FailureTable({ failures }: { failures: DeliveryFailure[] }) {
  return (
    <Table verticalSpacing="sm" fz={13} mt="lg">
      <TableThead>
        <TableTr>
          {(
            [
              "forms.columnFailureSubmitted",
              "forms.columnFailureVersion",
              "forms.columnFailureReason",
              "forms.columnFailureStatus",
            ] satisfies MessageKey[]
          ).map((key) => (
            <TableTh key={key} c="gray.6" fw={500}>
              {t(key)}
            </TableTh>
          ))}
          <TableTh />
        </TableTr>
      </TableThead>
      <TableTbody>
        {failures.map((failure) => (
          <TableTr key={failure.id}>
            <TableTd>
              <Text fz={13}>{formatDateTime(failure.submittedAt)}</Text>
              <Text fz={12} c="gray.6" ff="monospace">
                {failure.id}
              </Text>
            </TableTd>
            <TableTd>
              {t("forms.failureVersion", { version: failure.version })}
            </TableTd>
            <TableTd>
              <Text fz={13} ff="monospace">
                {failure.reason ?? t("forms.failureNoReason")}
              </Text>
            </TableTd>
            <TableTd>
              <StatusBadge failure={failure} />
            </TableTd>
            <TableTd ta="right" maw={320}>
              <RetryCell failure={failure} />
            </TableTd>
          </TableTr>
        ))}
      </TableTbody>
    </Table>
  );
}

function StatusBadge({ failure }: { failure: DeliveryFailure }) {
  const badge =
    statusBadges[failure.retry === "in_progress" ? "in_progress" : "failed"];
  const Icon = badge.icon;
  return (
    <Badge
      variant="light"
      color={badge.color}
      radius="xl"
      tt="none"
      fw={500}
      leftSection={<Icon size={12} stroke={1.5} />}
    >
      {t(badge.label)}
    </Badge>
  );
}

function RetryCell({ failure }: { failure: DeliveryFailure }) {
  switch (failure.retry) {
    case "available":
      return <RetryButton submissionId={failure.id} />;
    case "expired":
      return (
        <Text fz={13} c="gray.6" ta="left">
          {t("forms.failureRetryExpired", { days: DLQ_RETENTION_DAYS })}
        </Text>
      );
    case "gone":
      return (
        <Text fz={13} c="gray.6" ta="left">
          {t("forms.failureRetryGone")}
        </Text>
      );
    case "in_progress":
      return null;
  }
}

/** *Zustellung wiederholen*: not destructive, so no confirmation. */
function RetryButton({ submissionId }: { submissionId: string }) {
  const [error, setError] = useState<DeliveryRetryResult["error"]>(null);
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(async () => {
      const result = await retryFormDelivery(submissionId).catch(
        (): DeliveryRetryResult => ({ error: "forms.errorRetryFailed" }),
      );
      // On success the page refreshes into the retried state.
      setError(result.error);
    });
  }

  return (
    <Stack gap={4} align="flex-end">
      <Button
        size="xs"
        variant="default"
        leftSection={<IconRefresh size={16} stroke={1.5} />}
        onClick={retry}
        loading={pending}
      >
        {t("forms.failureRetry")}
      </Button>
      {error && (
        <Box ta="left">
          <FormError>{t(error, { days: DLQ_RETENTION_DAYS })}</FormError>
        </Box>
      )}
    </Stack>
  );
}

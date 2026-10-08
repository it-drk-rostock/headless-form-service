"use client";

import {
  Alert,
  Box,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
  Tooltip,
  VisuallyHidden,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconChartBar,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  conversionRate,
  deliveryRate,
  type FormStatistics,
  formatStatisticsPoint,
  STATISTICS_PERIODS,
  type StatisticsPeriod,
  type StatisticsPoint,
} from "@/lib/forms/statistics.ts";
import { formatPercent, type MessageKey, t } from "@/lib/i18n/index.ts";
import { EmptyState } from "../../../_components/EmptyState.tsx";

// Grey carries the data; delivery health uses the status colours, always
// with text, and red with an icon too (ui-design §2.3).
const DATA_COLOR = "gray.5";
const DELIVERY_SEGMENTS = [
  { key: "sent", label: "forms.statisticsSent", color: "green.6" },
  { key: "failed", label: "forms.statisticsFailed", color: "red.6" },
  { key: "queued", label: "forms.statisticsQueued", color: "gray.4" },
] as const satisfies {
  key: "sent" | "failed" | "queued";
  label: MessageKey;
  color: string;
}[];

const CHART_HEIGHT = 160;

/**
 * The *Statistik* view (blueprint §8): for today by hour or the last 7, 30
 * or 90 days by day, the submissions, form loads, conversion (submissions
 * per load) and sent vs failed; charts of submissions and, per day, of
 * loads over time; and the submissions per form version. The period follows
 * the URL (`&period=`), so switching it loads the page's data again, as a
 * reload would.
 */
export function FormStatisticsView({
  period,
  statistics,
}: {
  period: StatisticsPeriod;
  statistics: FormStatistics;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { totals, by } = statistics;

  function choosePeriod(next: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("view", "statistics");
    url.searchParams.set("period", next);
    startTransition(() => {
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
    });
  }

  return (
    <Box mt={40} style={{ opacity: pending ? 0.6 : 1 }} aria-busy={pending}>
      <Group justify="space-between" align="center">
        <Title order={2} fz={16}>
          {t("forms.statisticsTitle")}
        </Title>
        <SegmentedControl
          size="xs"
          aria-label={t("forms.statisticsPeriodLabel")}
          value={String(period)}
          onChange={choosePeriod}
          data={STATISTICS_PERIODS.map((days) => ({
            value: String(days),
            label: t(`forms.statisticsPeriod.${days}`),
          }))}
        />
      </Group>
      <Alert
        variant="outline"
        color="gray"
        icon={<IconInfoCircle size={16} stroke={1.5} />}
        py={6}
        mt="sm"
      >
        <Text fz={13}>{t("forms.statisticsHint")}</Text>
      </Alert>

      <SimpleGrid cols={{ base: 2, sm: 4 }} mt="lg">
        <StatTile
          label={t("forms.statisticsSubmissions")}
          value={String(totals.submissions)}
        />
        <StatTile
          label={t("forms.statisticsLoads")}
          value={String(totals.loads)}
        />
        <StatTile
          label={t("forms.statisticsConversion")}
          value={rateOrNone(conversionRate(totals))}
          hint={t("forms.statisticsConversionHint")}
        />
        <StatTile
          label={t("forms.statisticsDelivery")}
          value={rateOrNone(deliveryRate(totals))}
          hint={t("forms.statisticsDeliveryHint", {
            sent: totals.sent,
            failed: totals.failed,
          })}
        />
      </SimpleGrid>

      {totals.submissions === 0 && totals.loads === 0 ? (
        <EmptyState
          icon={<IconChartBar size={24} stroke={1.5} />}
          title={t("forms.statisticsEmptyTitle")}
          hint={t("forms.statisticsEmptyHint")}
        />
      ) : (
        <>
          {totals.submissions > 0 && <DeliveryBar statistics={statistics} />}
          <BarChart
            title={t(
              by === "hour"
                ? "forms.statisticsByHour"
                : "forms.statisticsByDay",
            )}
            statistics={statistics}
            value={(point) => point.submissions}
          />
          {/* Loads are counted per day only. */}
          {by === "day" && (
            <BarChart
              title={t("forms.statisticsLoadsByDay")}
              statistics={statistics}
              value={(point) => point.loads ?? 0}
            />
          )}
          {statistics.versions.length > 0 && (
            <VersionTable statistics={statistics} />
          )}
        </>
      )}
    </Box>
  );
}

function rateOrNone(rate: number | null): string {
  return rate === null ? t("forms.statisticsNone") : formatPercent(rate);
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Paper withBorder radius="md" p="md">
      <Text fz={13} c="gray.6">
        {label}
      </Text>
      <Text fz={22} fw={600} mt={4}>
        {value}
      </Text>
      {hint && (
        <Text fz={12} c="gray.6">
          {hint}
        </Text>
      )}
    </Paper>
  );
}

/** Sent vs failed (and still queued) as one proportional bar with a labelled key. */
function DeliveryBar({ statistics }: { statistics: FormStatistics }) {
  const { totals } = statistics;
  return (
    <Box mt="xl">
      <Title order={3} fz={14} fw={600}>
        {t("forms.statisticsDelivery")}
      </Title>
      <Group gap={2} mt="sm" wrap="nowrap" aria-hidden>
        {DELIVERY_SEGMENTS.filter(({ key }) => totals[key] > 0).map(
          ({ key, color }) => (
            <Box
              key={key}
              h={8}
              bg={color}
              style={{ flexGrow: totals[key], flexBasis: 0, borderRadius: 4 }}
            />
          ),
        )}
      </Group>
      <Group gap="lg" mt="xs">
        {DELIVERY_SEGMENTS.map(({ key, label, color }) => (
          <Group key={key} gap={6} wrap="nowrap">
            {key === "failed" ? (
              <Box c={color} display="flex">
                <IconAlertTriangle size={14} stroke={1.5} />
              </Box>
            ) : (
              <Box w={8} h={8} bg={color} style={{ borderRadius: 2 }} />
            )}
            <Text fz={13}>
              {t(label)}: {totals[key]}
            </Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

/**
 * One measure per hour or day as bars, one series, so no legend. Each
 * column is its whole height a hover target with the point's details; a
 * hidden table carries the same numbers for screen readers.
 */
function BarChart({
  title,
  statistics,
  value,
}: {
  title: string;
  statistics: FormStatistics;
  value: (point: StatisticsPoint) => number;
}) {
  const { series, by } = statistics;
  const max = Math.max(1, ...series.map(value));
  // About six time labels below the bars, every 6 hours for a day.
  const labelInterval = by === "hour" ? 6 : Math.ceil(series.length / 6);

  return (
    <Box mt="xl">
      <Title order={3} fz={14} fw={600}>
        {title}
      </Title>
      <Group gap={0} mt="sm" align="stretch" wrap="nowrap" aria-hidden>
        <Stack
          justify="space-between"
          h={CHART_HEIGHT}
          pr={8}
          style={{ flexShrink: 0 }}
        >
          <Text fz={12} c="gray.6" lh={1}>
            {max}
          </Text>
          <Text fz={12} c="gray.6" lh={1}>
            0
          </Text>
        </Stack>
        <Box style={{ flexGrow: 1, minWidth: 0 }}>
          <Group
            gap={2}
            h={CHART_HEIGHT}
            align="flex-end"
            wrap="nowrap"
            style={{
              borderTop: "1px dashed var(--mantine-color-gray-3)",
              borderBottom: "1px solid var(--mantine-color-gray-3)",
            }}
          >
            {series.map((point) => (
              <Bar key={point.at} point={point} share={value(point) / max} />
            ))}
          </Group>
          <Group gap={2} wrap="nowrap" mt={4}>
            {series.map((point, index) => (
              <Box key={point.at} style={{ flex: 1, minWidth: 0 }}>
                {index % labelInterval === 0 && (
                  <Text fz={12} c="gray.6" style={{ whiteSpace: "nowrap" }}>
                    {formatStatisticsPoint(point.at)}
                  </Text>
                )}
              </Box>
            ))}
          </Group>
        </Box>
      </Group>
      <VisuallyHidden>
        <table>
          <caption>
            {t("forms.statisticsChartLabel", {
              title,
              from: formatStatisticsPoint(statistics.from, true),
              to: formatStatisticsPoint(statistics.to, true),
            })}
          </caption>
          <thead>
            <tr>
              <th>{t("forms.statisticsColumnTime")}</th>
              <th>{title}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.at}>
                <td>{formatStatisticsPoint(point.at, true)}</td>
                <td>{value(point)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </VisuallyHidden>
    </Box>
  );
}

/** A column whose bar is `share` of the chart's height; hover shows the point. */
function Bar({ point, share }: { point: StatisticsPoint; share: number }) {
  return (
    <Tooltip
      withinPortal
      label={
        <Stack gap={0}>
          <Text fz={12} fw={600}>
            {formatStatisticsPoint(point.at, true)}
          </Text>
          <Text fz={12}>
            {t("forms.statisticsPointSubmissions", {
              count: point.submissions,
            })}
          </Text>
          <Text fz={12}>
            {t("forms.statisticsDeliveryHint", {
              sent: point.sent,
              failed: point.failed,
            })}
          </Text>
          {point.loads !== null && (
            <Text fz={12}>
              {t("forms.statisticsPointLoads", { count: point.loads })}
            </Text>
          )}
        </Stack>
      }
    >
      <Box
        h="100%"
        display="flex"
        style={{ flex: 1, minWidth: 0, alignItems: "flex-end" }}
      >
        <Box
          w="100%"
          h={`${share * 100}%`}
          mih={share > 0 ? 2 : 0}
          bg={DATA_COLOR}
          style={{ borderRadius: "4px 4px 0 0" }}
        />
      </Box>
    </Tooltip>
  );
}

/** Submissions per form version in the period, newest version first. */
function VersionTable({ statistics }: { statistics: FormStatistics }) {
  const { versions, totals } = statistics;
  return (
    <Box mt="xl">
      <Title order={3} fz={14} fw={600}>
        {t("forms.statisticsVersionsTitle")}
      </Title>
      <Table verticalSpacing="xs" fz={13} mt="xs" maw={560}>
        <TableThead>
          <TableTr>
            {(
              [
                "forms.statisticsColumnVersion",
                "forms.statisticsSubmissions",
                "forms.statisticsColumnShare",
              ] satisfies MessageKey[]
            ).map((key) => (
              <TableTh key={key} c="gray.6" fw={500}>
                {t(key)}
              </TableTh>
            ))}
          </TableTr>
        </TableThead>
        <TableTbody>
          {versions.map(({ version, submissions }) => {
            const share = submissions / totals.submissions;
            return (
              <TableTr key={version}>
                <TableTd>{t("forms.statisticsVersion", { version })}</TableTd>
                <TableTd>{submissions}</TableTd>
                <TableTd>
                  <Group gap="sm" wrap="nowrap">
                    <Box w={120} h={6} bg="gray.1" style={{ borderRadius: 3 }}>
                      <Box
                        h="100%"
                        w={`${share * 100}%`}
                        bg={DATA_COLOR}
                        style={{ borderRadius: 3 }}
                      />
                    </Box>
                    <Text fz={13}>{formatPercent(share)}</Text>
                  </Group>
                </TableTd>
              </TableTr>
            );
          })}
        </TableTbody>
      </Table>
    </Box>
  );
}

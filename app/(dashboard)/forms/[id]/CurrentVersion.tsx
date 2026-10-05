import { Badge, Stack, Text } from "@mantine/core";
import type { CurrentVersion } from "@/lib/forms/publish.ts";
import { formatDateTime, t } from "@/lib/i18n/index.ts";

/**
 * Which version visitors see, as a dot badge for the page header: the
 * version number, or that the form is not yet published.
 */
export function CurrentVersionBadge({
  current,
}: {
  current: CurrentVersion | null;
}) {
  return (
    <Badge
      variant="dot"
      color={current ? "green" : "gray"}
      radius="xl"
      tt="none"
      fw={500}
    >
      {current
        ? t("forms.version", { version: current.version })
        : t("forms.notPublished")}
    </Badge>
  );
}

/** Which version visitors see, with who published it and when. */
export function CurrentVersionDetails({
  current,
}: {
  current: CurrentVersion | null;
}) {
  if (!current) {
    return (
      <Stack gap={2}>
        <Text>{t("forms.notPublished")}</Text>
        <Text fz={13} c="gray.6">
          {t("forms.notPublishedHint")}
        </Text>
      </Stack>
    );
  }
  const params = {
    version: current.version,
    at: formatDateTime(current.publishedAt),
  };
  return (
    <Text>
      {current.publishedBy
        ? t("forms.publishedVersionBy", {
            ...params,
            by: current.publishedBy,
          })
        : t("forms.publishedVersion", params)}
    </Text>
  );
}

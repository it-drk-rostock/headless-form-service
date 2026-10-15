"use client";

import {
  Anchor,
  Button,
  CopyButton,
  Group,
  Stack,
  Text,
  Textarea,
  Title,
} from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import type { FormAccessType } from "@/lib/forms/types.ts";
import { t } from "@/lib/i18n/index.ts";

/** The same embed works for public and protected forms; only the visitor's link differs. */
export function FormEmbed({
  formId,
  pageUrl,
  accessType,
}: {
  formId: string;
  pageUrl: string | null;
  accessType: FormAccessType;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const snippet = origin
    ? `<div data-form="${formId}"></div>\n<script src="${origin}/embed.js" defer></script>`
    : "";

  return (
    <Stack mt={40} gap="md" maw={800}>
      <Title order={2} fz={16}>
        {t("forms.embedTitle")}
      </Title>
      <Text fz={13}>{t("forms.embedHint")}</Text>
      <Textarea
        label={t("forms.embedSnippet")}
        value={snippet}
        readOnly
        autosize
        minRows={3}
        onFocus={(event) => event.currentTarget.select()}
        styles={{
          input: { fontFamily: "var(--mantine-font-family-monospace)" },
        }}
      />
      <Group>
        <CopyButton value={snippet}>
          {({ copied, copy }) => (
            <Button
              variant="default"
              disabled={!snippet}
              onClick={copy}
              leftSection={
                copied ? (
                  <IconCheck size={16} stroke={1.5} />
                ) : (
                  <IconCopy size={16} stroke={1.5} />
                )
              }
            >
              {t(copied ? "forms.embedCopied" : "forms.embedCopy")}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Text fz={13} c="gray.6">
        {t("forms.embedOriginHint")}
      </Text>
      <Stack gap={4} align="flex-start">
        <Text fz={13} fw={500}>
          {t("forms.embedPage")}
        </Text>
        {pageUrl ? (
          <Anchor
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            fz={13}
            style={{ overflowWrap: "anywhere" }}
          >
            {pageUrl}
          </Anchor>
        ) : (
          <Text fz={13} c="gray.6">
            {t("forms.embedNoPage")}
          </Text>
        )}
      </Stack>
      <Text fz={13}>
        {t(
          accessType === "public"
            ? "forms.embedPublicHint"
            : "forms.embedProtectedHint",
        )}
      </Text>
    </Stack>
  );
}

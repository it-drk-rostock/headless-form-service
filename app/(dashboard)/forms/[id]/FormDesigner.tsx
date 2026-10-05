"use client";

import { Alert, Box, Center, Group, Loader, Paper, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { DraftSaveResult } from "@/lib/forms/actions.ts";
import type { DraftStamp, FormDraft } from "@/lib/forms/draft.ts";
import { formatDateTime, t } from "@/lib/i18n/index.ts";
import { FormError } from "../../../_components/FormError.tsx";

// Creator needs the browser (DOM, drag and drop), so it is not rendered on
// the server.
const DraftCreator = dynamic(() => import("./DraftCreator.tsx"), {
  ssr: false,
  loading: () => (
    <Center h="100%">
      <Loader size="sm" color="gray" />
    </Center>
  ),
});

/**
 * The designer: SurveyJS Creator on the form's single draft, with who saved
 * it last. Saving the draft does not change what visitors see.
 */
export function FormDesigner({
  formId,
  draft,
}: {
  formId: string;
  draft: FormDraft;
}) {
  const [saved, setSaved] = useState(draft.stamp);
  const [result, setResult] = useState<DraftSaveResult | null>(null);

  function handleSaved(next: DraftSaveResult) {
    setResult(next);
    if (next.error === null) setSaved(next.stamp);
  }

  return (
    <Box mt="xl">
      <Group justify="space-between" align="center" mb="sm" gap="xs">
        <Alert
          variant="outline"
          color="gray"
          icon={<IconInfoCircle size={16} stroke={1.5} />}
          py={6}
        >
          <Text fz={13}>{t("forms.designerHint")}</Text>
        </Alert>
        <Text fz={13} c="gray.6" role="status">
          {stampText(saved)}
        </Text>
      </Group>
      {result?.error && (
        <Box mb="sm">
          <FormError>{t(result.error)}</FormError>
        </Box>
      )}
      <Paper
        withBorder
        radius="md"
        h="calc(100dvh - 260px)"
        mih={560}
        style={{ overflow: "hidden" }}
      >
        <DraftCreator
          formId={formId}
          schema={draft.schema}
          onSaved={handleSaved}
        />
      </Paper>
    </Box>
  );
}

function stampText({ savedAt, savedBy }: DraftStamp): string {
  if (!savedAt) return t("forms.draftNeverSaved");
  const at = formatDateTime(savedAt);
  return savedBy
    ? t("forms.draftSavedBy", { at, by: savedBy })
    : t("forms.draftSaved", { at });
}

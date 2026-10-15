"use client";

import { Alert, Box, Center, Group, Loader, Paper, Text } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { ITheme } from "survey-core";
import type { DraftSaveResult } from "@/lib/forms/actions.ts";
import type { DraftSchema } from "@/lib/forms/draft.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../../_components/FormError.tsx";
import { DraftSavedStatus, useDraftStatus } from "./DraftStatus.tsx";

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
  schema,
  theme,
  globalTheme,
}: {
  formId: string;
  schema: DraftSchema;
  theme: ITheme | null;
  globalTheme: ITheme | null;
}) {
  const { setStamp, reset } = useDraftStatus();
  const [result, setResult] = useState<DraftSaveResult | null>(null);

  function handleSaved(next: DraftSaveResult) {
    setResult(next);
    if (next.error === null) setStamp(next.stamp);
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
        <DraftSavedStatus />
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
        {/* Reopens on the draft that restoring or discarding left. */}
        <DraftCreator
          key={reset.resetCount}
          formId={formId}
          schema={reset.draft?.schema ?? schema}
          theme={reset.draft ? reset.draft.theme : theme}
          globalTheme={globalTheme}
          onSaved={handleSaved}
        />
      </Paper>
    </Box>
  );
}

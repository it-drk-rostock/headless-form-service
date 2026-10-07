"use client";

import { Input, Paper, Stack, Text } from "@mantine/core";
import { useDeferredValue, useState } from "react";
import { sampleAnswers } from "@/lib/forms/email-template.ts";
import { t } from "@/lib/i18n/index.ts";
import {
  type EmailTemplate,
  renderNotificationEmail,
} from "@/lib/shared/notification.ts";

/**
 * The notification email as recipients get it, rendered with sample answers
 * by the same renderer the dispatcher uses (blueprint §5.3). The HTML runs in
 * a sandboxed frame without scripts, apart from the dashboard.
 */
export function EmailPreview({
  template,
  formName,
  schema,
}: {
  template: EmailTemplate;
  formName: string;
  schema: unknown;
}) {
  const [submittedAt] = useState(() => new Date());
  // Rendering waits for typing to pause, so the editor stays responsive.
  // The mode too: a body is only ever rendered in its own mode.
  const deferredMode = useDeferredValue(template.mode);
  const deferredSubject = useDeferredValue(template.subject);
  const deferredBody = useDeferredValue(template.body);
  const { subject, html } = renderNotificationEmail(
    { mode: deferredMode, subject: deferredSubject, body: deferredBody },
    { formName, submittedAt, schema, answers: sampleAnswers(schema) },
  );

  return (
    <Input.Wrapper
      label={t("forms.emailPreview")}
      description={t("forms.emailPreviewHint")}
    >
      <Paper withBorder radius="md" mt={4} style={{ overflow: "hidden" }}>
        <Stack gap={0}>
          <Text
            fz={13}
            px="md"
            py="xs"
            style={{ borderBottom: "1px solid var(--mantine-color-gray-3)" }}
          >
            <Text span fz={13} c="gray.6">
              {t("forms.emailSubject")}:{" "}
            </Text>
            {subject}
          </Text>
          <iframe
            title={t("forms.emailPreviewFrame")}
            sandbox=""
            srcDoc={html}
            style={{ border: 0, width: "100%", height: 640, display: "block" }}
          />
        </Stack>
      </Paper>
    </Input.Wrapper>
  );
}

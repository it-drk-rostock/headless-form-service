"use client";

import {
  Alert,
  Box,
  Button,
  Group,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { IconCircleCheck } from "@tabler/icons-react";
import { useActionState, useState } from "react";
import { t } from "@/lib/i18n/index.ts";
import {
  type SettingsActionState,
  updateSettings,
} from "@/lib/settings/actions.ts";
import { MAX_ALLOWED_ORIGINS } from "@/lib/settings/origins.ts";
import { MAX_RATE_LIMIT, MIN_RATE_LIMIT } from "@/lib/settings/rate-limits.ts";
import { MAX_RECIPIENT_DOMAINS } from "@/lib/settings/recipient-domains.ts";
import type { GlobalSettings } from "@/lib/settings/types.ts";
import { FormError } from "../../_components/FormError.tsx";

const initialState: SettingsActionState = { error: null };

type Values = {
  allowedOrigins: string;
  allowedRecipientDomains: string;
  loadRateLimit: string;
  submitRateLimit: string;
};

/**
 * The allowed origins, the allowed recipient domains and both rate limits,
 * below what they are for.
 * *Speichern* sits top right and
 * stays disabled until something changed (ui-design §5).
 */
export function SettingsForm({
  allowedOrigins,
  allowedRecipientDomains,
  loadRateLimit,
  submitRateLimit,
}: GlobalSettings) {
  // What is stored, as the page last rendered it. A save refreshes the page,
  // so the normalised lists (or another person's change) arrive here and
  // replace what is in the inputs.
  const stored: Values = {
    allowedOrigins: allowedOrigins.join("\n"),
    allowedRecipientDomains: allowedRecipientDomains.join("\n"),
    loadRateLimit: String(loadRateLimit),
    submitRateLimit: String(submitRateLimit),
  };
  const [shown, setShown] = useState<Values>(stored);
  const [values, setValues] = useState<Values>(stored);
  if (!sameValues(shown, stored)) {
    setShown(stored);
    setValues(stored);
  }
  const [state, formAction, pending] = useActionState(
    updateSettings,
    initialState,
  );
  const changed = !sameValues(values, stored);

  return (
    <Box component="form" action={formAction} mt="md" maw={800}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text fz={13} c="gray.6">
          {t("settings.intro")}
        </Text>
        <Button
          type="submit"
          size="xs"
          disabled={!changed}
          loading={pending}
          style={{ flexShrink: 0 }}
        >
          {t("settings.save")}
        </Button>
      </Group>
      <Stack gap="sm" mt="sm">
        {state.error && (
          <FormError>
            {t(state.error, {
              origin: state.origin ?? "",
              maxOrigins: MAX_ALLOWED_ORIGINS,
              domain: state.domain ?? "",
              maxDomains: MAX_RECIPIENT_DOMAINS,
              min: MIN_RATE_LIMIT,
              max: MAX_RATE_LIMIT,
            })}
          </FormError>
        )}
        {state.savedAt && !changed && (
          <Alert
            color="green"
            icon={<IconCircleCheck size={16} stroke={1.5} />}
            role="status"
          >
            {t("settings.saved")}
          </Alert>
        )}
        <Textarea
          name="allowedOrigins"
          label={t("settings.origins")}
          description={t("settings.originsHint", {
            maxOrigins: MAX_ALLOWED_ORIGINS,
          })}
          placeholder="https://www.drk-rostock.de"
          autosize
          minRows={3}
          value={values.allowedOrigins}
          onChange={(event) =>
            setValues({ ...values, allowedOrigins: event.currentTarget.value })
          }
          spellCheck={false}
          styles={{
            input: { fontFamily: "var(--mantine-font-family-monospace)" },
          }}
        />
        {stored.allowedOrigins === "" && (
          <Text fz={13} c="orange.8">
            {t("settings.originsNone")}
          </Text>
        )}
        <Textarea
          name="allowedRecipientDomains"
          label={t("settings.recipientDomains")}
          description={t("settings.recipientDomainsHint", {
            maxDomains: MAX_RECIPIENT_DOMAINS,
          })}
          placeholder="drk-rostock.de"
          autosize
          minRows={3}
          value={values.allowedRecipientDomains}
          onChange={(event) =>
            setValues({
              ...values,
              allowedRecipientDomains: event.currentTarget.value,
            })
          }
          spellCheck={false}
          styles={{
            input: { fontFamily: "var(--mantine-font-family-monospace)" },
          }}
        />
        {stored.allowedRecipientDomains === "" && (
          <Text fz={13} c="orange.8">
            {t("settings.recipientDomainsNone")}
          </Text>
        )}
        <RateLimitInput
          name="loadRateLimit"
          label={t("settings.loadRateLimit")}
          description={t("settings.loadRateLimitHint")}
          value={values.loadRateLimit}
          onChange={(loadRateLimit) => setValues({ ...values, loadRateLimit })}
        />
        <RateLimitInput
          name="submitRateLimit"
          label={t("settings.submitRateLimit")}
          description={t("settings.submitRateLimitHint")}
          value={values.submitRateLimit}
          onChange={(submitRateLimit) =>
            setValues({ ...values, submitRateLimit })
          }
        />
      </Stack>
    </Box>
  );
}

/** A whole number of requests; the server checks the bounds. */
function RateLimitInput({
  onChange,
  ...props
}: {
  name: string;
  label: string;
  description: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextInput
      {...props}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={6}
      w={320}
      onChange={(event) => onChange(event.currentTarget.value)}
      required
    />
  );
}

function sameValues(a: Values, b: Values): boolean {
  return (
    a.allowedOrigins === b.allowedOrigins &&
    a.allowedRecipientDomains === b.allowedRecipientDomains &&
    a.loadRateLimit === b.loadRateLimit &&
    a.submitRateLimit === b.submitRateLimit
  );
}

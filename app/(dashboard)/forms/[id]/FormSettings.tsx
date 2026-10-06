"use client";

import {
  Alert,
  Box,
  Button,
  Group,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { IconCircleCheck } from "@tabler/icons-react";
import { useActionState, useState } from "react";
import {
  type FormActionState,
  updateFormSettings,
} from "@/lib/forms/actions.ts";
import { FORM_NAME_MAX_LENGTH } from "@/lib/forms/name.ts";
import { MAX_RECIPIENTS } from "@/lib/forms/recipients.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../../_components/FormError.tsx";

const initialState: FormActionState = { error: null };

type Values = { name: string; recipients: string; turnstileEnabled: boolean };

/**
 * The form's name, recipients and bot protection. *Speichern* sits top right
 * and stays disabled until something changed (ui-design §5).
 */
export function FormSettings({
  id,
  name,
  recipients,
  turnstileEnabled,
}: {
  id: string;
  name: string;
  recipients: string[];
  turnstileEnabled: boolean;
}) {
  // What is stored, as the page last rendered it. A save refreshes the page,
  // so the normalised list (or another person's change) arrives here and
  // replaces what is in the inputs.
  const stored: Values = {
    name,
    recipients: recipients.join("\n"),
    turnstileEnabled,
  };
  const [shown, setShown] = useState<Values>(stored);
  const [values, setValues] = useState<Values>(stored);
  if (!sameValues(shown, stored)) {
    setShown(stored);
    setValues(stored);
  }
  const [state, formAction, pending] = useActionState(
    updateFormSettings,
    initialState,
  );
  const changed = !sameValues(values, stored);

  return (
    <Box component="form" action={formAction} mt={40} maw={800}>
      <Group justify="space-between" align="center">
        <Title order={2} fz={16}>
          {t("forms.settingsTitle")}
        </Title>
        <Button type="submit" size="xs" disabled={!changed} loading={pending}>
          {t("forms.save")}
        </Button>
      </Group>
      <Stack gap="sm" mt="sm">
        {state.error && (
          <FormError>
            {t(state.error, {
              address: state.address ?? "",
              max: FORM_NAME_MAX_LENGTH,
              maxRecipients: MAX_RECIPIENTS,
            })}
          </FormError>
        )}
        {state.savedAt && !changed && (
          <Alert
            color="green"
            icon={<IconCircleCheck size={16} stroke={1.5} />}
            role="status"
          >
            {t("forms.saved")}
          </Alert>
        )}
        <input type="hidden" name="id" value={id} />
        <TextInput
          name="name"
          label={t("forms.name")}
          description={t("forms.nameHint", { max: FORM_NAME_MAX_LENGTH })}
          maxLength={FORM_NAME_MAX_LENGTH}
          value={values.name}
          onChange={(event) =>
            setValues({ ...values, name: event.currentTarget.value })
          }
          required
        />
        <Textarea
          name="recipients"
          label={t("forms.recipients")}
          description={t("forms.recipientsHint", {
            maxRecipients: MAX_RECIPIENTS,
          })}
          placeholder="team@drk-rostock.de"
          autosize
          minRows={3}
          value={values.recipients}
          onChange={(event) =>
            setValues({ ...values, recipients: event.currentTarget.value })
          }
          spellCheck={false}
          styles={{
            input: { fontFamily: "var(--mantine-font-family-monospace)" },
          }}
        />
        {stored.recipients === "" && (
          <Text fz={13} c="orange.8">
            {t("forms.recipientsNone")}
          </Text>
        )}
        <Switch
          name="turnstileEnabled"
          label={t("forms.turnstile")}
          description={t("forms.turnstileHint")}
          checked={values.turnstileEnabled}
          onChange={(event) =>
            setValues({
              ...values,
              turnstileEnabled: event.currentTarget.checked,
            })
          }
          // Label and description left, the toggle right (ui-design §5).
          labelPosition="left"
          styles={{ body: { justifyContent: "space-between", gap: 24 } }}
          mt="xs"
        />
      </Stack>
    </Box>
  );
}

function sameValues(a: Values, b: Values): boolean {
  return (
    a.name === b.name &&
    a.recipients === b.recipients &&
    a.turnstileEnabled === b.turnstileEnabled
  );
}

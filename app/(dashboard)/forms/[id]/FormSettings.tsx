"use client";

import {
  Alert,
  Box,
  Button,
  Group,
  Select,
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
import { SENDER_NAME_MAX_LENGTH } from "@/lib/forms/sender-name.ts";
import { t } from "@/lib/i18n/index.ts";
import {
  DEFAULT_SENDER_NAME,
  type EmailQuestion,
} from "@/lib/shared/notification.ts";
import { FormError } from "../../../_components/FormError.tsx";

const initialState: FormActionState = { error: null };

type Values = {
  name: string;
  recipients: string;
  senderDisplayName: string;
  /** Empty for none. */
  replyToQuestion: string;
  turnstileEnabled: boolean;
  isClosed: boolean;
};

/**
 * The form's name, recipients, sender display name, Reply-To question, bot
 * protection and whether it is closed. *Speichern* sits top right and stays disabled until
 * something changed (ui-design §5).
 */
export function FormSettings({
  id,
  name,
  recipients,
  senderDisplayName,
  replyToQuestion,
  emailQuestions,
  turnstileEnabled,
  isClosed,
}: {
  id: string;
  name: string;
  recipients: string[];
  senderDisplayName: string;
  replyToQuestion: string | null;
  /** The current version's email questions; null while unpublished. */
  emailQuestions: EmailQuestion[] | null;
  turnstileEnabled: boolean;
  isClosed: boolean;
}) {
  // What is stored, as the page last rendered it. A save refreshes the page,
  // so the normalised list (or another person's change) arrives here and
  // replaces what is in the inputs.
  const stored: Values = {
    name,
    recipients: recipients.join("\n"),
    senderDisplayName,
    replyToQuestion: replyToQuestion ?? "",
    turnstileEnabled,
    isClosed,
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
  // A stored question the current version no longer has stays selectable,
  // so it is visible, and is flagged.
  const replyToMissing =
    replyToQuestion !== null &&
    !(emailQuestions ?? []).some((q) => q.name === replyToQuestion);
  const replyToChoices = [
    ...(emailQuestions ?? []).map((question) => ({
      value: question.name,
      label:
        question.title === question.name
          ? question.name
          : `${question.title} (${question.name})`,
    })),
    ...(replyToMissing
      ? [
          {
            value: replyToQuestion,
            label: t("forms.replyToMissing", { name: replyToQuestion }),
          },
        ]
      : []),
  ];

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
              maxSenderName: SENDER_NAME_MAX_LENGTH,
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
        {/* What the page showed, so only a switch writes `is_closed`. */}
        <input type="hidden" name="wasClosed" value={String(isClosed)} />
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
        <TextInput
          name="senderDisplayName"
          label={t("forms.senderName")}
          description={t("forms.senderNameHint", {
            max: SENDER_NAME_MAX_LENGTH,
            default: DEFAULT_SENDER_NAME,
          })}
          placeholder={DEFAULT_SENDER_NAME}
          maxLength={SENDER_NAME_MAX_LENGTH}
          value={values.senderDisplayName}
          onChange={(event) =>
            setValues({
              ...values,
              senderDisplayName: event.currentTarget.value,
            })
          }
        />
        {/* Its own hidden input: Select's is left out while disabled, which
            would clear the stored question. */}
        <input
          type="hidden"
          name="replyToQuestion"
          value={values.replyToQuestion}
        />
        <Select
          label={t("forms.replyTo")}
          description={
            emailQuestions === null
              ? t("forms.replyToUnpublished")
              : emailQuestions.length === 0 && !replyToMissing
                ? t("forms.replyToNoEmailQuestions")
                : t("forms.replyToHint")
          }
          placeholder={t("forms.replyToNone")}
          data={replyToChoices}
          value={values.replyToQuestion || null}
          onChange={(value) =>
            setValues({ ...values, replyToQuestion: value ?? "" })
          }
          disabled={replyToChoices.length === 0}
          clearable
        />
        {replyToMissing && values.replyToQuestion === replyToQuestion && (
          <Text fz={13} c="orange.8">
            {t("forms.replyToMissingHint")}
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
        <Switch
          name="isClosed"
          label={t("forms.closed")}
          description={t("forms.closedHint")}
          checked={values.isClosed}
          onChange={(event) =>
            setValues({ ...values, isClosed: event.currentTarget.checked })
          }
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
    a.senderDisplayName === b.senderDisplayName &&
    a.replyToQuestion === b.replyToQuestion &&
    a.turnstileEnabled === b.turnstileEnabled &&
    a.isClosed === b.isClosed
  );
}

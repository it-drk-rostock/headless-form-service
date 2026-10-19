"use client";

import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useState, useTransition } from "react";
import { type PublishResult, publishForm } from "@/lib/forms/actions.ts";
import { CHANGELOG_MAX_LENGTH } from "@/lib/forms/publish.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../../_components/FormError.tsx";
import { useDraftStatus } from "./DraftStatus.tsx";

/**
 * *Veröffentlichen*: confirms in a modal, with an optional changelog, and
 * makes the draft the next form version. The page refreshes, so the new
 * current version shows at once.
 */
export function PublishButton({
  formId,
  currentVersion,
  hasRecipients,
}: {
  formId: string;
  currentVersion: number | null;
  hasRecipients: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const { unsaved, unpublished } = useDraftStatus();
  // Bumped on every opening, so each starts with an empty dialog.
  const [opening, setOpening] = useState(0);
  const close = () => setOpened(false);

  return (
    <>
      <Button
        size="xs"
        disabled={unsaved || !unpublished}
        onClick={() => {
          setOpening(opening + 1);
          setOpened(true);
        }}
      >
        {t("forms.publish")}
      </Button>
      <Modal
        opened={opened}
        onClose={close}
        title={t("forms.publishTitle")}
        closeButtonProps={{ "aria-label": t("forms.close") }}
        centered
      >
        <PublishDialog
          key={opening}
          formId={formId}
          nextVersion={(currentVersion ?? 0) + 1}
          hasRecipients={hasRecipients}
          onClose={close}
        />
      </Modal>
    </>
  );
}

function PublishDialog({
  formId,
  nextVersion,
  hasRecipients,
  onClose,
}: {
  formId: string;
  nextVersion: number;
  hasRecipients: boolean;
  onClose: () => void;
}) {
  const [changelog, setChangelog] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [pending, startTransition] = useTransition();
  // The designer saves shortly after each change; publishing waits for it.
  const { unsaved, unpublished } = useDraftStatus();

  function publish() {
    startTransition(async () => {
      setResult(
        await publishForm(formId, changelog).catch(
          (): PublishResult => ({ error: "forms.errorGeneric" }),
        ),
      );
    });
  }

  if (result?.error === null) {
    return (
      <Stack gap="sm">
        <Alert
          color="green"
          icon={<IconCircleCheck size={16} stroke={1.5} />}
          role="status"
        >
          {t("forms.published", { version: result.version })}
        </Alert>
        <Group justify="flex-end">
          <Button onClick={onClose}>{t("forms.close")}</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      {result?.error && (
        <FormError>{t(result.error, { max: CHANGELOG_MAX_LENGTH })}</FormError>
      )}
      <Text fz="sm">{t("forms.publishText", { version: nextVersion })}</Text>
      {!hasRecipients && (
        <Alert
          color="orange"
          icon={<IconAlertTriangle size={16} stroke={1.5} />}
        >
          {t("forms.publishNoRecipients")}
        </Alert>
      )}
      <Textarea
        label={t("forms.changelog")}
        description={t("forms.changelogHint", { max: CHANGELOG_MAX_LENGTH })}
        maxLength={CHANGELOG_MAX_LENGTH}
        autosize
        minRows={3}
        maxRows={8}
        value={changelog}
        onChange={(event) => setChangelog(event.currentTarget.value)}
        data-autofocus
      />
      {unsaved && (
        <Alert
          variant="outline"
          color="gray"
          icon={<IconInfoCircle size={16} stroke={1.5} />}
          role="status"
        >
          {t("forms.publishWaitsForSave")}
        </Alert>
      )}
      <Group justify="flex-end" gap="xs" mt="xs">
        <Button variant="default" onClick={onClose}>
          {t("forms.cancel")}
        </Button>
        <Button
          onClick={publish}
          loading={pending}
          disabled={unsaved || !unpublished}
        >
          {t("forms.publishSubmit")}
        </Button>
      </Group>
    </Stack>
  );
}

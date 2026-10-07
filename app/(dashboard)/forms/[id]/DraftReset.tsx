"use client";

import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import {
  IconArrowBackUp,
  IconCircleCheck,
  IconInfoCircle,
} from "@tabler/icons-react";
import { useState, useTransition } from "react";
import {
  type DraftResetResult,
  discardDraftChanges,
  restoreFormVersion,
} from "@/lib/forms/actions.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../../_components/FormError.tsx";
import { useDraftStatus } from "./DraftStatus.tsx";

/**
 * *Änderungen verwerfen*: confirms in a modal, then resets the draft to the
 * current version. Destructive, so a subtle red button (ui-design §2.3).
 */
export function DiscardButton({
  formId,
  currentVersion,
}: {
  formId: string;
  currentVersion: number;
}) {
  return (
    <ResetButton
      button={(open) => (
        <Button
          size="xs"
          variant="subtle"
          color="red"
          leftSection={<IconArrowBackUp size={16} stroke={1.5} />}
          onClick={open}
        >
          {t("forms.discard")}
        </Button>
      )}
      title={t("forms.discardTitle")}
      text={t("forms.discardText", { version: currentVersion })}
      submit={t("forms.discardSubmit")}
      done={t("forms.discarded", { version: currentVersion })}
      run={() => discardDraftChanges(formId)}
    />
  );
}

/**
 * *Wiederherstellen* on a row of the version history: confirms in a modal,
 * then copies the version into the draft, to be published as `nextVersion`.
 */
export function RestoreButton({
  formId,
  version,
  currentVersion,
}: {
  formId: string;
  version: number;
  currentVersion: number;
}) {
  return (
    <ResetButton
      button={(open) => (
        <Button size="xs" variant="default" onClick={open}>
          {t("forms.restore")}
        </Button>
      )}
      title={t("forms.restoreTitle", { version })}
      text={t("forms.restoreText", { version, current: currentVersion })}
      submit={t("forms.restoreSubmit")}
      done={t("forms.restored", { version, next: currentVersion + 1 })}
      run={() => restoreFormVersion(formId, version)}
    />
  );
}

/** A button that confirms replacing the draft in a modal, then does it. */
function ResetButton({
  button,
  title,
  ...dialog
}: {
  button: (open: () => void) => React.ReactNode;
  title: string;
} & Omit<React.ComponentProps<typeof ResetDialog>, "onClose">) {
  const [opened, setOpened] = useState(false);
  // Bumped on every opening, so each starts with a fresh dialog.
  const [opening, setOpening] = useState(0);
  const close = () => setOpened(false);

  return (
    <>
      {button(() => {
        setOpening(opening + 1);
        setOpened(true);
      })}
      <Modal
        opened={opened}
        onClose={close}
        title={title}
        closeButtonProps={{ "aria-label": t("forms.close") }}
        centered
      >
        <ResetDialog key={opening} {...dialog} onClose={close} />
      </Modal>
    </>
  );
}

function ResetDialog({
  text,
  submit,
  done,
  run,
  onClose,
}: {
  text: string;
  submit: string;
  done: string;
  run: () => Promise<DraftResetResult>;
  onClose: () => void;
}) {
  const [result, setResult] = useState<DraftResetResult | null>(null);
  const [pending, startTransition] = useTransition();
  // An editor's save still on its way would overwrite the replaced draft.
  const { unsaved, resetDraft } = useDraftStatus();

  function confirm() {
    startTransition(async () => {
      const next = await run().catch(
        (): DraftResetResult => ({ error: "forms.errorGeneric" }),
      );
      setResult(next);
      if (next.error === null) resetDraft(next.draft);
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
          {done}
        </Alert>
        <Group justify="flex-end">
          <Button onClick={onClose}>{t("forms.close")}</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      {result?.error && <FormError>{t(result.error)}</FormError>}
      <Text fz="sm">{text}</Text>
      {unsaved && (
        <Alert
          variant="outline"
          color="gray"
          icon={<IconInfoCircle size={16} stroke={1.5} />}
          role="status"
        >
          {t("forms.resetWaitsForSave")}
        </Alert>
      )}
      <Group justify="flex-end" gap="xs" mt="xs">
        <Button variant="default" onClick={onClose}>
          {t("forms.cancel")}
        </Button>
        <Button
          color="red"
          onClick={confirm}
          loading={pending}
          disabled={unsaved}
          data-autofocus
        >
          {submit}
        </Button>
      </Group>
    </Stack>
  );
}

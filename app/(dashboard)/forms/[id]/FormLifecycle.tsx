"use client";

import {
  Box,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconArchive, IconArchiveOff, IconTrash } from "@tabler/icons-react";
import { useState, useTransition } from "react";
import {
  archiveForm,
  deleteForm,
  type FormLifecycleResult,
  unarchiveForm,
} from "@/lib/forms/actions.ts";
import { confirmsDeletion } from "@/lib/forms/name.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../../_components/FormError.tsx";

/**
 * Below a form's settings: archiving it or taking it out of the archive,
 * and, for Super Admins only, deleting it for good. Each confirms in a
 * modal; deleting asks for the form's name first (ui-design §2.3).
 */
export function FormLifecycle({
  id,
  name,
  archived,
  canDelete,
}: {
  id: string;
  name: string;
  archived: boolean;
  /** Only Super Admins; the database checks it again. */
  canDelete: boolean;
}) {
  return (
    <Box mt={40} maw={800}>
      <Title order={2} fz={16}>
        {t("forms.lifecycleTitle")}
      </Title>
      <Stack gap="lg" mt="sm">
        {archived ? (
          <Row
            label={t("forms.unarchive")}
            hint={t("forms.unarchiveHint")}
            button={(open) => (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconArchiveOff size={16} stroke={1.5} />}
                onClick={open}
              >
                {t("forms.unarchive")}
              </Button>
            )}
            title={t("forms.unarchiveTitle")}
            dialog={(close) => (
              <ConfirmDialog
                text={t("forms.unarchiveText", { name })}
                submit={t("forms.unarchive")}
                run={() => unarchiveForm(id)}
                onClose={close}
              />
            )}
          />
        ) : (
          <Row
            label={t("forms.archive")}
            hint={t("forms.archiveHint")}
            button={(open) => (
              <Button
                size="xs"
                variant="default"
                leftSection={<IconArchive size={16} stroke={1.5} />}
                onClick={open}
              >
                {t("forms.archive")}
              </Button>
            )}
            title={t("forms.archiveTitle")}
            dialog={(close) => (
              <ConfirmDialog
                text={t("forms.archiveText", { name })}
                submit={t("forms.archive")}
                run={() => archiveForm(id)}
                onClose={close}
              />
            )}
          />
        )}
        {canDelete && (
          <Row
            label={t("forms.delete")}
            hint={t("forms.deleteHint")}
            button={(open) => (
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconTrash size={16} stroke={1.5} />}
                onClick={open}
              >
                {t("forms.delete")}
              </Button>
            )}
            title={t("forms.deleteTitle")}
            dialog={(close) => (
              <DeleteDialog id={id} name={name} onClose={close} />
            )}
          />
        )}
      </Stack>
    </Box>
  );
}

/** Label and hint left, the button right (ui-design §5), opening a modal. */
function Row({
  label,
  hint,
  button,
  title,
  dialog,
}: {
  label: string;
  hint: string;
  button: (open: () => void) => React.ReactNode;
  title: string;
  dialog: (close: () => void) => React.ReactNode;
}) {
  const [opened, setOpened] = useState(false);
  // Bumped on every opening, so each starts with a fresh dialog.
  const [opening, setOpening] = useState(0);
  const close = () => setOpened(false);

  return (
    <Group justify="space-between" align="center" wrap="nowrap" gap={24}>
      <Stack gap={2}>
        <Text fz="sm" fw={500}>
          {label}
        </Text>
        <Text fz={13} c="gray.6">
          {hint}
        </Text>
      </Stack>
      <Box style={{ flexShrink: 0 }}>
        {button(() => {
          setOpening(opening + 1);
          setOpened(true);
        })}
      </Box>
      <Modal
        opened={opened}
        onClose={close}
        title={title}
        closeButtonProps={{ "aria-label": t("forms.close") }}
        centered
      >
        <Box key={opening}>{dialog(close)}</Box>
      </Modal>
    </Group>
  );
}

function ConfirmDialog({
  text,
  submit,
  run,
  onClose,
}: {
  text: string;
  submit: string;
  run: () => Promise<FormLifecycleResult>;
  onClose: () => void;
}) {
  const [error, setError] = useState<FormLifecycleResult["error"]>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await run().catch(
        (): FormLifecycleResult => ({ error: "forms.errorGeneric" }),
      );
      setError(result.error);
      // The page refreshes into the new state.
      if (result.error === null) onClose();
    });
  }

  return (
    <Stack gap="sm">
      {error && <FormError>{t(error)}</FormError>}
      <Text fz="sm">{text}</Text>
      <Group justify="flex-end" gap="xs" mt="xs">
        <Button variant="default" onClick={onClose}>
          {t("forms.cancel")}
        </Button>
        <Button onClick={confirm} loading={pending} data-autofocus>
          {submit}
        </Button>
      </Group>
    </Stack>
  );
}

function DeleteDialog({
  id,
  name,
  onClose,
}: {
  id: string;
  name: string;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<FormLifecycleResult["error"]>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      // On success the action opens the forms list and does not return.
      const result = await deleteForm(id, typed).catch(
        (): FormLifecycleResult => ({ error: "forms.errorGeneric" }),
      );
      setError(result.error);
    });
  }

  return (
    <Stack gap="sm">
      {error && <FormError>{t(error)}</FormError>}
      <Text fz="sm">{t("forms.deleteText", { name })}</Text>
      <TextInput
        label={t("forms.deleteConfirm")}
        placeholder={name}
        value={typed}
        onChange={(event) => setTyped(event.currentTarget.value)}
        autoComplete="off"
        spellCheck={false}
        data-autofocus
      />
      <Group justify="flex-end" gap="xs" mt="xs">
        <Button variant="default" onClick={onClose}>
          {t("forms.cancel")}
        </Button>
        <Button
          color="red"
          leftSection={<IconTrash size={16} stroke={1.5} />}
          onClick={confirm}
          loading={pending}
          disabled={!confirmsDeletion(typed, name)}
        >
          {t("forms.delete")}
        </Button>
      </Group>
    </Stack>
  );
}

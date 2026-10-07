"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  CopyButton,
  Drawer,
  Group,
  Modal,
  NumberInput,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBan,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconInfoCircle,
  IconPlus,
  IconTicket,
  IconX,
} from "@tabler/icons-react";
import { useState, useTransition } from "react";
import {
  createFormPass,
  type FormPassCreateResult,
  type FormPassRevokeResult,
  revokeFormPass,
} from "@/lib/forms/actions.ts";
import {
  type FormPass,
  type FormPassStatus,
  PASS_DEFAULT_EXPIRY_HOURS,
  PASS_DEFAULT_MAX_USES,
  PASS_EXPIRY_MAX_HOURS,
  PASS_MAX_USES_LIMIT,
  type PassMetadataEntry,
} from "@/lib/forms/passes.ts";
import type { FormAccessType } from "@/lib/forms/types.ts";
import { formatDateTime, type MessageKey, t } from "@/lib/i18n/index.ts";
import {
  PASS_METADATA_KEY_MAX_LENGTH,
  PASS_METADATA_MAX_ENTRIES,
  PASS_METADATA_VALUE_MAX_LENGTH,
} from "@/lib/shared/form-pass.ts";
import { EmptyState } from "../../../_components/EmptyState.tsx";
import { FormError } from "../../../_components/FormError.tsx";

// Red is the brand, so no status uses it (ui-design §2.3).
const statusColors: Record<FormPassStatus, string> = {
  valid: "green",
  used_up: "gray",
  expired: "gray",
  revoked: "gray",
};

/**
 * The *Pässe* view: a protected form's passes, newest first, with their
 * status but never their secrets. *+ Pass anlegen* opens a drawer, and the
 * new pass's link is shown there only once. Valid passes can be revoked.
 * A public form needs no passes; one switched back to public still lists
 * the passes it had.
 */
export function FormPasses({
  formId,
  accessType,
  hasPage,
  passes,
}: {
  formId: string;
  accessType: FormAccessType;
  hasPage: boolean;
  passes: FormPass[];
}) {
  const isProtected = accessType === "protected";
  if (!isProtected && passes.length === 0) {
    return (
      <EmptyState
        icon={<IconTicket size={24} stroke={1.5} />}
        title={t("forms.passesPublicTitle")}
        hint={t("forms.passesPublicHint")}
      />
    );
  }

  return (
    <Box mt={40}>
      <Group justify="space-between" align="center">
        <Title order={2} fz={16}>
          {t("forms.passesTitle")}
        </Title>
        {isProtected && (
          <CreatePassButton formId={formId} disabled={!hasPage} />
        )}
      </Group>
      <Alert
        variant="outline"
        color="gray"
        icon={<IconInfoCircle size={16} stroke={1.5} />}
        py={6}
        mt="sm"
      >
        <Text fz={13}>
          {t(isProtected ? "forms.passesHint" : "forms.passesPublicHint")}
        </Text>
      </Alert>
      {isProtected && !hasPage && (
        <Text fz={13} c="orange.8" mt="sm">
          {t("forms.passesNoPage")}
        </Text>
      )}
      {passes.length === 0 ? (
        <EmptyState
          icon={<IconTicket size={24} stroke={1.5} />}
          title={t("forms.passesEmptyTitle")}
          hint={t("forms.passesEmptyHint")}
        />
      ) : (
        <PassTable passes={passes} />
      )}
    </Box>
  );
}

function PassTable({ passes }: { passes: FormPass[] }) {
  return (
    <Table verticalSpacing="sm" fz={13} mt="lg">
      <TableThead>
        <TableTr>
          {(
            [
              "forms.columnPassCreated",
              "forms.columnPassUses",
              "forms.columnPassExpires",
              "forms.columnPassMetadata",
              "forms.columnPassStatus",
            ] satisfies MessageKey[]
          ).map((key) => (
            <TableTh key={key} c="gray.6" fw={500}>
              {t(key)}
            </TableTh>
          ))}
          <TableTh />
        </TableTr>
      </TableThead>
      <TableTbody>
        {passes.map((pass) => (
          <TableTr key={pass.id}>
            <TableTd>
              <Text fz={13}>{formatDateTime(pass.createdAt)}</Text>
              <Text fz={13} c="gray.6">
                {pass.source === "n8n"
                  ? t("forms.passSourceN8n")
                  : pass.createdBy && t("forms.passBy", { by: pass.createdBy })}
              </Text>
            </TableTd>
            <TableTd>
              {pass.maxUses === null
                ? t("forms.passUsesUnlimited", { used: pass.useCount })
                : t("forms.passUses", {
                    used: pass.useCount,
                    max: pass.maxUses,
                  })}
            </TableTd>
            <TableTd>
              {pass.expiresAt === null
                ? t("forms.passNoExpiry")
                : formatDateTime(pass.expiresAt)}
            </TableTd>
            <TableTd maw={320}>
              <Metadata metadata={pass.metadata} />
            </TableTd>
            <TableTd>
              <Badge
                variant="dot"
                color={statusColors[pass.status]}
                radius="xl"
                tt="none"
                fw={500}
              >
                {t(`forms.passStatus.${pass.status}`)}
              </Badge>
            </TableTd>
            <TableTd ta="right">
              {/* Used up, expired or revoked passes are invalid already. */}
              {pass.status === "valid" && <RevokeButton passId={pass.id} />}
            </TableTd>
          </TableTr>
        ))}
      </TableTbody>
    </Table>
  );
}

function Metadata({ metadata }: { metadata: FormPass["metadata"] }) {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return <Text c="gray.6">{t("forms.passNoMetadata")}</Text>;
  }
  return (
    <Stack gap={0}>
      {entries.map(([key, value]) => (
        <Text key={key} fz={13} style={{ overflowWrap: "anywhere" }}>
          <Text span ff="monospace" fz={12} c="gray.6">
            {key}:
          </Text>{" "}
          {String(value)}
        </Text>
      ))}
    </Stack>
  );
}

/**
 * *Widerrufen* on a valid pass: confirms in a modal, as it cannot be undone.
 * Destructive, so a subtle red button (ui-design §2.3).
 */
function RevokeButton({ passId }: { passId: string }) {
  const [opened, modal] = useDisclosure(false);
  const [error, setError] = useState<FormPassRevokeResult["error"]>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setError(null);
    modal.open();
  }

  function confirm() {
    startTransition(async () => {
      const result = await revokeFormPass(passId).catch(
        (): FormPassRevokeResult => ({ error: "forms.errorGeneric" }),
      );
      setError(result.error);
      // The page refreshes into the revoked state.
      if (result.error === null) modal.close();
    });
  }

  return (
    <>
      <Button
        size="xs"
        variant="subtle"
        color="red"
        leftSection={<IconBan size={16} stroke={1.5} />}
        onClick={open}
      >
        {t("forms.passRevoke")}
      </Button>
      <Modal
        opened={opened}
        onClose={modal.close}
        title={t("forms.passRevokeTitle")}
        closeButtonProps={{ "aria-label": t("forms.close") }}
        centered
      >
        <Stack gap="sm">
          {error && <FormError>{t(error)}</FormError>}
          <Text fz="sm">{t("forms.passRevokeText")}</Text>
          <Group justify="flex-end" gap="xs" mt="xs">
            <Button variant="default" onClick={modal.close}>
              {t("forms.cancel")}
            </Button>
            <Button
              color="red"
              onClick={confirm}
              loading={pending}
              data-autofocus
            >
              {t("forms.passRevoke")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

/** *+ Pass anlegen*: the view's primary action, opening the drawer. */
function CreatePassButton({
  formId,
  disabled,
}: {
  formId: string;
  /** Without a form page there is no link to show. */
  disabled: boolean;
}) {
  const [opened, drawer] = useDisclosure(false);
  // Bumped on every opening, so each starts with a fresh form and no link.
  const [opening, setOpening] = useState(0);

  return (
    <>
      <Button
        size="xs"
        leftSection={<IconPlus size={16} stroke={1.5} />}
        onClick={() => {
          setOpening(opening + 1);
          drawer.open();
        }}
        disabled={disabled}
      >
        {t("forms.passCreate")}
      </Button>
      <Drawer
        opened={opened}
        onClose={drawer.close}
        position="right"
        title={t("forms.passCreateTitle")}
        closeButtonProps={{ "aria-label": t("forms.close") }}
      >
        <CreatePass key={opening} formId={formId} onBack={drawer.close} />
      </Drawer>
    </>
  );
}

function CreatePass({
  formId,
  onBack,
}: {
  formId: string;
  onBack: () => void;
}) {
  const [maxUses, setMaxUses] = useState<number | string>(
    PASS_DEFAULT_MAX_USES,
  );
  const [expiresInHours, setExpiresInHours] = useState<number | string>(
    PASS_DEFAULT_EXPIRY_HOURS,
  );
  const [metadata, setMetadata] = useState<PassMetadataEntry[]>([]);
  const [result, setResult] = useState<FormPassCreateResult | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      setResult(
        await createFormPass(formId, {
          maxUses: optionalNumber(maxUses),
          expiresInHours: optionalNumber(expiresInHours),
          metadata,
        }).catch((): FormPassCreateResult => ({ error: "forms.errorGeneric" })),
      );
    });
  }

  function setEntry(index: number, entry: PassMetadataEntry) {
    setMetadata(metadata.map((e, i) => (i === index ? entry : e)));
  }

  if (result?.error === null) {
    return <CreatedPass url={result.url} onDone={onBack} />;
  }

  return (
    <Stack gap="sm">
      {result?.error && (
        <FormError>
          {t(result.error, {
            maxUses: PASS_MAX_USES_LIMIT,
            maxHours: PASS_EXPIRY_MAX_HOURS,
            maxValue: PASS_METADATA_VALUE_MAX_LENGTH,
            maxEntries: PASS_METADATA_MAX_ENTRIES,
          })}
        </FormError>
      )}
      <NumberInput
        label={t("forms.passMaxUses")}
        description={t("forms.passMaxUsesHint", { max: PASS_MAX_USES_LIMIT })}
        value={maxUses}
        onChange={setMaxUses}
        min={1}
        max={PASS_MAX_USES_LIMIT}
        allowDecimal={false}
        allowNegative={false}
        data-autofocus
      />
      <NumberInput
        label={t("forms.passExpiry")}
        description={t("forms.passExpiryHint", { max: PASS_EXPIRY_MAX_HOURS })}
        value={expiresInHours}
        onChange={setExpiresInHours}
        min={1}
        max={PASS_EXPIRY_MAX_HOURS}
        allowDecimal={false}
        allowNegative={false}
      />
      <Stack gap={4}>
        <Text fz="sm" fw={500}>
          {t("forms.passMetadata")}
        </Text>
        <Text fz={13} c="gray.6">
          {t("forms.passMetadataHint")}
        </Text>
        {metadata.map((entry, index) => (
          // Rows have no identity but their place; removing re-renders the rest.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <Group key={index} gap="xs" wrap="nowrap" align="flex-start">
            <TextInput
              aria-label={t("forms.passMetadataKey")}
              placeholder={t("forms.passMetadataKey")}
              value={entry.key}
              onChange={(event) =>
                setEntry(index, { ...entry, key: event.currentTarget.value })
              }
              maxLength={PASS_METADATA_KEY_MAX_LENGTH}
              spellCheck={false}
              styles={{
                input: { fontFamily: "var(--mantine-font-family-monospace)" },
              }}
              w="40%"
            />
            <TextInput
              aria-label={t("forms.passMetadataValue")}
              placeholder={t("forms.passMetadataValue")}
              value={entry.value}
              onChange={(event) =>
                setEntry(index, { ...entry, value: event.currentTarget.value })
              }
              maxLength={PASS_METADATA_VALUE_MAX_LENGTH}
              style={{ flexGrow: 1 }}
            />
            <ActionIcon
              variant="subtle"
              color="gray"
              size="lg"
              aria-label={t("forms.passMetadataRemove")}
              onClick={() =>
                setMetadata(metadata.filter((_, i) => i !== index))
              }
            >
              <IconX size={16} stroke={1.5} />
            </ActionIcon>
          </Group>
        ))}
        <Box>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlus size={16} stroke={1.5} />}
            onClick={() => setMetadata([...metadata, { key: "", value: "" }])}
            disabled={metadata.length >= PASS_METADATA_MAX_ENTRIES}
            mt={4}
          >
            {t("forms.passMetadataAdd")}
          </Button>
        </Box>
      </Stack>
      {/* Sticky footer, so the actions stay in reach (ui-design §5). */}
      <Group
        justify="flex-end"
        gap="xs"
        pos="sticky"
        bottom={0}
        py="sm"
        bg="white"
      >
        <Button variant="default" onClick={onBack}>
          {t("teams.back")}
        </Button>
        <Button onClick={create} loading={pending}>
          {t("forms.passCreateSubmit")}
        </Button>
      </Group>
    </Stack>
  );
}

/** The new pass's link, shown this once, with a copy button. */
function CreatedPass({ url, onDone }: { url: string; onDone: () => void }) {
  return (
    <Stack gap="sm">
      <Alert
        color="green"
        icon={<IconCircleCheck size={16} stroke={1.5} />}
        role="status"
        title={t("forms.passCreated")}
      >
        {t("forms.passCreatedHint")}
      </Alert>
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <TextInput
          label={t("forms.passLink")}
          value={url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          styles={{
            input: { fontFamily: "var(--mantine-font-family-monospace)" },
          }}
          style={{ flexGrow: 1 }}
        />
        <CopyButton value={url}>
          {({ copied, copy }) => (
            <Button
              variant="default"
              leftSection={
                copied ? (
                  <IconCheck size={16} stroke={1.5} />
                ) : (
                  <IconCopy size={16} stroke={1.5} />
                )
              }
              onClick={copy}
            >
              {t(copied ? "forms.passCopied" : "forms.passCopy")}
            </Button>
          )}
        </CopyButton>
      </Group>
      <Group justify="flex-end" mt="xs">
        <Button onClick={onDone}>{t("forms.passDone")}</Button>
      </Group>
    </Stack>
  );
}

/** A NumberInput's value as a number, or null when left empty. */
function optionalNumber(value: number | string): number | null {
  return typeof value === "number" ? value : null;
}

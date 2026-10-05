"use client";

import { Button, Drawer, Group, Stack, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { useActionState, useEffect } from "react";
import { t } from "@/lib/i18n/index.ts";
import {
  createTeam,
  renameTeam,
  type TeamFormState,
} from "@/lib/teams/actions.ts";
import { TEAM_NAME_MAX_LENGTH } from "@/lib/teams/name.ts";
import { FormError } from "../../_components/FormError.tsx";

const initialState: TeamFormState = { error: null };

/** *+ Team anlegen*: the page's primary action, with a create drawer (ui-design §5). */
export function CreateTeamButton() {
  const [opened, drawer] = useDisclosure(false);
  return (
    <>
      <Button
        size="xs"
        leftSection={<IconPlus size={16} stroke={1.5} />}
        onClick={drawer.open}
      >
        {t("teams.create")}
      </Button>
      <Drawer
        opened={opened}
        onClose={drawer.close}
        position="right"
        title={t("teams.createTitle")}
        closeButtonProps={{ "aria-label": t("teams.close") }}
      >
        <TeamNameForm
          action={createTeam}
          submitLabel={t("teams.createSubmit")}
          onDone={drawer.close}
        />
      </Drawer>
    </>
  );
}

/** *Umbenennen* on a team page, with a drawer holding the current name. */
export function RenameTeamButton({ id, name }: { id: string; name: string }) {
  const [opened, drawer] = useDisclosure(false);
  return (
    <>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconPencil size={16} stroke={1.5} />}
        onClick={drawer.open}
      >
        {t("teams.rename")}
      </Button>
      <Drawer
        opened={opened}
        onClose={drawer.close}
        position="right"
        title={t("teams.renameTitle")}
        closeButtonProps={{ "aria-label": t("teams.close") }}
      >
        <TeamNameForm
          action={renameTeam}
          id={id}
          defaultName={name}
          submitLabel={t("teams.renameSubmit")}
          onDone={drawer.close}
        />
      </Drawer>
    </>
  );
}

function TeamNameForm({
  action,
  id,
  defaultName,
  submitLabel,
  onDone,
}: {
  action: (state: TeamFormState, data: FormData) => Promise<TeamFormState>;
  id?: string;
  defaultName?: string;
  submitLabel: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.savedAt) onDone();
  }, [state.savedAt, onDone]);

  return (
    <form action={formAction}>
      <Stack gap="sm">
        {state.error && (
          <FormError>{t(state.error, { max: TEAM_NAME_MAX_LENGTH })}</FormError>
        )}
        {id && <input type="hidden" name="id" value={id} />}
        <TextInput
          name="name"
          label={t("teams.name")}
          description={t("teams.nameHint", { max: TEAM_NAME_MAX_LENGTH })}
          defaultValue={defaultName}
          maxLength={TEAM_NAME_MAX_LENGTH}
          required
          data-autofocus
        />
        {/* Sticky footer, so the actions stay in reach (ui-design §5). */}
        <Group
          justify="flex-end"
          gap="xs"
          pos="sticky"
          bottom={0}
          py="sm"
          bg="white"
        >
          <Button variant="default" onClick={onDone}>
            {t("teams.back")}
          </Button>
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

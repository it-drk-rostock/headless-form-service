"use client";

import { Button, Drawer, Group, Select, Stack, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus } from "@tabler/icons-react";
import { useActionState } from "react";
import { createForm, type FormActionState } from "@/lib/forms/actions.ts";
import { FORM_NAME_MAX_LENGTH } from "@/lib/forms/name.ts";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../_components/FormError.tsx";
import type { ShellTeam } from "../../_shell/navigation.ts";

const initialState: FormActionState = { error: null };

/**
 * *+ Formular anlegen*: the page's primary action. The drawer asks for a
 * name and which of the person's teams owns the form.
 */
export function CreateFormButton({ teams }: { teams: ShellTeam[] }) {
  const [opened, drawer] = useDisclosure(false);
  return (
    <>
      <Button
        size="xs"
        leftSection={<IconPlus size={16} stroke={1.5} />}
        onClick={drawer.open}
      >
        {t("forms.create")}
      </Button>
      <Drawer
        opened={opened}
        onClose={drawer.close}
        position="right"
        title={t("forms.createTitle")}
        closeButtonProps={{ "aria-label": t("teams.close") }}
      >
        <CreateForm teams={teams} onBack={drawer.close} />
      </Drawer>
    </>
  );
}

function CreateForm({
  teams,
  onBack,
}: {
  teams: ShellTeam[];
  onBack: () => void;
}) {
  const [state, formAction, pending] = useActionState(createForm, initialState);

  return (
    <form action={formAction}>
      <Stack gap="sm">
        {state.error && (
          <FormError>{t(state.error, { max: FORM_NAME_MAX_LENGTH })}</FormError>
        )}
        <TextInput
          name="name"
          label={t("forms.name")}
          description={t("forms.nameHint", { max: FORM_NAME_MAX_LENGTH })}
          maxLength={FORM_NAME_MAX_LENGTH}
          required
          data-autofocus
        />
        <Select
          name="teamId"
          label={t("forms.team")}
          description={t("forms.teamHint")}
          placeholder={t("forms.teamPlaceholder")}
          data={teams.map((team) => ({ value: team.id, label: team.name }))}
          // Only one choice: make it, so nobody has to.
          defaultValue={teams.length === 1 ? teams[0].id : null}
          allowDeselect={false}
          searchable={teams.length > 7}
          required
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
          <Button variant="default" onClick={onBack}>
            {t("teams.back")}
          </Button>
          <Button type="submit" loading={pending}>
            {t("forms.createSubmit")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

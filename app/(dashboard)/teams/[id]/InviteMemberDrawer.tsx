"use client";

import {
  Alert,
  Button,
  Drawer,
  Group,
  Radio,
  RadioGroup,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconCircleCheck, IconUserPlus } from "@tabler/icons-react";
import { useActionState, useState } from "react";
import { t } from "@/lib/i18n/index.ts";
import {
  inviteMemberAction,
  type MemberFormState,
} from "@/lib/members/actions.ts";
import { FULL_NAME_MAX_LENGTH } from "@/lib/members/types.ts";
import { FormError } from "../../../_components/FormError.tsx";

const initialState: MemberFormState = { error: null };

/** *+ Mitglied einladen*: the team page's primary action, with a drawer (ui-design §5). */
export function InviteMemberButton({ teamId }: { teamId: string }) {
  const [opened, drawer] = useDisclosure(false);
  // A new key gives a fresh, empty form for the next invite.
  const [formKey, setFormKey] = useState(0);
  const close = () => {
    drawer.close();
    setFormKey((key) => key + 1);
  };

  return (
    <>
      <Button
        size="xs"
        leftSection={<IconUserPlus size={16} stroke={1.5} />}
        onClick={drawer.open}
      >
        {t("members.invite")}
      </Button>
      <Drawer
        opened={opened}
        onClose={close}
        position="right"
        title={t("members.inviteTitle")}
        closeButtonProps={{ "aria-label": t("teams.close") }}
      >
        <InviteForm
          key={formKey}
          teamId={teamId}
          onClose={close}
          onAnother={() => setFormKey((key) => key + 1)}
        />
      </Drawer>
    </>
  );
}

function InviteForm({
  teamId,
  onClose,
  onAnother,
}: {
  teamId: string;
  onClose: () => void;
  onAnother: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    inviteMemberAction,
    initialState,
  );

  if (state.outcome === "invited" || state.outcome === "added") {
    return (
      <Stack gap="sm">
        <Alert
          color="green"
          icon={<IconCircleCheck size={16} stroke={1.5} />}
          role="status"
        >
          {t(
            state.outcome === "invited" ? "members.invited" : "members.added",
            {
              email: state.email ?? "",
            },
          )}
        </Alert>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={onAnother}>
            {t("members.inviteAnother")}
          </Button>
          <Button onClick={onClose}>{t("members.done")}</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <form action={formAction}>
      <Stack gap="sm">
        <Text fz={13} c="gray.6">
          {t("members.inviteIntro")}
        </Text>
        {state.error && (
          <FormError>
            {t(state.error, {
              email: state.email ?? "",
              max: FULL_NAME_MAX_LENGTH,
            })}
          </FormError>
        )}
        <input type="hidden" name="teamId" value={teamId} />
        <TextInput
          name="email"
          type="email"
          label={t("members.email")}
          defaultValue={state.email}
          autoComplete="off"
          required
          data-autofocus
        />
        <TextInput
          name="fullName"
          label={t("members.fullName")}
          description={t("members.fullNameHint")}
          maxLength={FULL_NAME_MAX_LENGTH}
          autoComplete="off"
        />
        <RadioGroup name="role" label={t("members.role")} defaultValue="member">
          <Stack gap="xs" mt={6}>
            <Radio
              value="member"
              label={t("teams.role.member")}
              description={t("members.roleHint.member")}
            />
            <Radio
              value="team_admin"
              label={t("teams.role.team_admin")}
              description={t("members.roleHint.team_admin")}
            />
          </Stack>
        </RadioGroup>
        {/* Sticky footer, so the actions stay in reach (ui-design §5). */}
        <Group
          justify="flex-end"
          gap="xs"
          pos="sticky"
          bottom={0}
          py="sm"
          bg="white"
        >
          <Button variant="default" onClick={onClose}>
            {t("teams.back")}
          </Button>
          <Button type="submit" loading={pending}>
            {t("members.inviteSubmit")}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

"use client";

import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconUserMinus,
} from "@tabler/icons-react";
import { useActionState, useEffect } from "react";
import { type MessageKey, t } from "@/lib/i18n/index.ts";
import {
  changeMemberRole,
  type MemberFormState,
  removeMember,
  sendPasswordLink,
} from "@/lib/members/actions.ts";
import { type Member, memberName } from "@/lib/members/types.ts";
import { FormError } from "../../../_components/FormError.tsx";

export type MemberAction = {
  kind: "makeAdmin" | "makeMember" | "passwordLink" | "remove";
  member: Member;
};

type Action = (
  state: MemberFormState,
  data: FormData,
) => Promise<MemberFormState>;

/** What each row action shows and does. */
const ACTIONS: Record<
  MemberAction["kind"],
  {
    title: MessageKey;
    text: MessageKey;
    submit: MessageKey;
    action: Action;
    role?: Member["role"];
    /** Whether it can take the team's last Team Admin away. */
    losesTeamAdmin?: boolean;
    destructive?: boolean;
  }
> = {
  makeAdmin: {
    title: "members.makeAdmin",
    text: "members.makeAdminText",
    submit: "members.makeAdmin",
    action: changeMemberRole,
    role: "team_admin",
  },
  makeMember: {
    title: "members.makeMember",
    text: "members.makeMemberText",
    submit: "members.makeMember",
    action: changeMemberRole,
    role: "member",
    losesTeamAdmin: true,
  },
  passwordLink: {
    title: "members.sendPasswordLink",
    text: "members.sendPasswordLinkText",
    submit: "members.sendPasswordLinkSubmit",
    action: sendPasswordLink,
  },
  remove: {
    title: "members.remove",
    text: "members.removeText",
    submit: "members.removeSubmit",
    action: removeMember,
    losesTeamAdmin: true,
    destructive: true,
  },
};

/**
 * Confirms a row action (ui-design §2.3: destructive actions are confirmed in
 * a modal). The last Team Admin cannot be demoted or removed, except by a
 * Super Admin, who is warned first; the database enforces the same rule.
 */
export function MemberActionModal({
  teamId,
  action,
  isLastTeamAdmin,
  isSelf,
  viewerIsSuperAdmin,
  onClose,
}: {
  teamId: string;
  action: MemberAction | null;
  isLastTeamAdmin: boolean;
  isSelf: boolean;
  viewerIsSuperAdmin: boolean;
  onClose: () => void;
}) {
  const config = action && ACTIONS[action.kind];
  return (
    <Modal
      opened={action !== null}
      onClose={onClose}
      title={config && t(config.title)}
      closeButtonProps={{ "aria-label": t("teams.close") }}
      centered
    >
      {action && config && (
        // Keyed, so every opening starts with a fresh action state.
        <ActionForm
          key={`${action.kind}:${action.member.userId}`}
          teamId={teamId}
          member={action.member}
          config={config}
          lastTeamAdmin={
            config.losesTeamAdmin && isLastTeamAdmin
              ? viewerIsSuperAdmin
                ? "override"
                : "blocked"
              : null
          }
          isSelf={isSelf}
          onClose={onClose}
        />
      )}
    </Modal>
  );
}

function ActionForm({
  teamId,
  member,
  config,
  lastTeamAdmin,
  isSelf,
  onClose,
}: {
  teamId: string;
  member: Member;
  config: (typeof ACTIONS)[MemberAction["kind"]];
  lastTeamAdmin: "blocked" | "override" | null;
  isSelf: boolean;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(config.action, {
    error: null,
  });
  const params = { name: memberName(member), email: member.email };

  useEffect(() => {
    if (state.outcome === "saved") onClose();
  }, [state.outcome, onClose]);

  if (state.outcome === "sent") {
    return (
      <Stack gap="sm">
        <Alert
          color="green"
          icon={<IconCircleCheck size={16} stroke={1.5} />}
          role="status"
        >
          {t("members.passwordLinkSent", params)}
        </Alert>
        <Group justify="flex-end">
          <Button onClick={onClose}>{t("members.done")}</Button>
        </Group>
      </Stack>
    );
  }

  if (lastTeamAdmin === "blocked") {
    return (
      <Stack gap="sm">
        <Alert
          variant="outline"
          color="gray"
          icon={<IconInfoCircle size={16} stroke={1.5} />}
        >
          {t("members.lastAdminBlocked", params)}
        </Alert>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("members.done")}
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <form action={formAction}>
      <Stack gap="sm">
        {state.error && <FormError>{t(state.error, params)}</FormError>}
        <Text fz="sm">{t(config.text, params)}</Text>
        {isSelf && config.destructive && (
          <Text fz="sm">{t("members.removeSelfText")}</Text>
        )}
        {lastTeamAdmin === "override" && (
          <Alert
            color="orange"
            icon={<IconAlertTriangle size={16} stroke={1.5} />}
          >
            {t("members.lastAdminOverride", params)}
          </Alert>
        )}
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="userId" value={member.userId} />
        {config.role && <input type="hidden" name="role" value={config.role} />}
        <Group justify="flex-end" gap="xs" mt="xs">
          <Button variant="default" onClick={onClose}>
            {t("members.cancel")}
          </Button>
          <Button
            type="submit"
            color={config.destructive ? "red" : undefined}
            leftSection={
              config.destructive && <IconUserMinus size={16} stroke={1.5} />
            }
            loading={pending}
          >
            {t(config.submit)}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

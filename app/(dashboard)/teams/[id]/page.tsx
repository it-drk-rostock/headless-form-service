import { Alert, Group, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/profile.ts";
import { formatDate, t } from "@/lib/i18n/index.ts";
import { listMembers } from "@/lib/members/queries.ts";
import { getTeam } from "@/lib/teams/queries.ts";
import { ContentPanel } from "../../../_components/ContentPanel.tsx";
import { RenameTeamButton } from "../TeamNameDrawer.tsx";
import { TeamRoleBadge } from "../TeamRoleBadge.tsx";
import { InviteMemberButton } from "./InviteMemberDrawer.tsx";
import { MembersTable } from "./MembersTable.tsx";

export async function generateMetadata({
  params,
}: PageProps<"/teams/[id]">): Promise<Metadata> {
  const team = await getTeam((await params).id);
  return { title: team?.name ?? t("teams.notFoundTitle") };
}

/**
 * A team's details and members. Teams the person does not belong to are not
 * found (RLS). Team Admins and Super Admins also manage the members.
 */
export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  const [profile, team, members] = await Promise.all([
    requireProfile(),
    getTeam(id),
    listMembers(id),
  ]);
  if (!team) notFound();
  const canManage = profile.isSuperAdmin || team.role === "team_admin";

  return (
    <ContentPanel
      title={team.name}
      subtitle={team.id}
      actions={
        canManage && (
          <Group gap="xs" wrap="nowrap">
            {profile.isSuperAdmin && (
              <RenameTeamButton id={team.id} name={team.name} />
            )}
            <InviteMemberButton teamId={team.id} />
          </Group>
        )
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 3 }} mt="xl" maw={800}>
        <Fact label={t("teams.detailRole")}>
          <TeamRoleBadge role={team.role} />
        </Fact>
        <Fact label={t("teams.detailMembers")}>
          <Text>{team.memberCount}</Text>
        </Fact>
        <Fact label={t("teams.detailCreated")}>
          <Text>{formatDate(team.createdAt)}</Text>
        </Fact>
      </SimpleGrid>

      <Title order={2} fz={16} mt={40}>
        {t("members.title")}
      </Title>
      {profile.isSuperAdmin &&
        members.length > 0 &&
        !members.some((m) => m.role === "team_admin") && (
          <Alert
            variant="outline"
            color="gray"
            icon={<IconInfoCircle size={16} stroke={1.5} />}
            mt="sm"
            maw={800}
          >
            {t("members.noTeamAdmin")}
          </Alert>
        )}
      {members.length > 0 ? (
        <MembersTable
          teamId={team.id}
          members={members}
          viewerId={profile.id}
          viewerIsSuperAdmin={profile.isSuperAdmin}
          canManage={canManage}
        />
      ) : (
        <Text fz={13} c="gray.6" mt="sm">
          {t("members.empty")}
        </Text>
      )}
    </ContentPanel>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Stack gap={4} align="flex-start">
      <Text fz={13} c="gray.6">
        {label}
      </Text>
      {children}
    </Stack>
  );
}

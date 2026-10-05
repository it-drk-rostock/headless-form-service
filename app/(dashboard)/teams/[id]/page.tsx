import { SimpleGrid, Stack, Text } from "@mantine/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/profile.ts";
import { formatDate, t } from "@/lib/i18n/index.ts";
import { getTeam } from "@/lib/teams/queries.ts";
import { ContentPanel } from "../../../_components/ContentPanel.tsx";
import { RenameTeamButton } from "../TeamNameDrawer.tsx";
import { TeamRoleBadge } from "../TeamRoleBadge.tsx";

export async function generateMetadata({
  params,
}: PageProps<"/teams/[id]">): Promise<Metadata> {
  const team = await getTeam((await params).id);
  return { title: team?.name ?? t("teams.notFoundTitle") };
}

/** A team's details. Teams the person does not belong to are not found (RLS). */
export default async function TeamPage({ params }: PageProps<"/teams/[id]">) {
  const { id } = await params;
  const [profile, team] = await Promise.all([requireProfile(), getTeam(id)]);
  if (!team) notFound();

  return (
    <ContentPanel
      title={team.name}
      subtitle={team.id}
      actions={
        profile.isSuperAdmin && (
          <RenameTeamButton id={team.id} name={team.name} />
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

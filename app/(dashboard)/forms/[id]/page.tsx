import { SimpleGrid, Stack, Text } from "@mantine/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getForm } from "@/lib/forms/queries.ts";
import { formatDate, t } from "@/lib/i18n/index.ts";
import { AnchorLink } from "../../../_components/AnchorLink.tsx";
import { ContentPanel } from "../../../_components/ContentPanel.tsx";
import { FormStatusBadge } from "../FormStatusBadge.tsx";
import { FormSettings } from "./FormSettings.tsx";

export async function generateMetadata({
  params,
}: PageProps<"/forms/[id]">): Promise<Metadata> {
  const form = await getForm((await params).id);
  return { title: form?.name ?? t("forms.notFoundTitle") };
}

/**
 * A form and its settings. Forms of teams the person does not belong to are
 * not found (RLS); every member of the owning team may change the settings.
 */
export default async function FormPage({ params }: PageProps<"/forms/[id]">) {
  const form = await getForm((await params).id);
  if (!form) notFound();

  return (
    <ContentPanel title={form.name} subtitle={form.id}>
      <SimpleGrid cols={{ base: 1, sm: 3 }} mt="xl" maw={800}>
        <Fact label={t("forms.detailTeam")}>
          <AnchorLink href={`/teams/${form.teamId}`}>
            {form.teamName}
          </AnchorLink>
        </Fact>
        <Fact label={t("forms.detailStatus")}>
          <FormStatusBadge status={form.status} />
        </Fact>
        <Fact label={t("forms.detailCreated")}>
          <Text>{formatDate(form.createdAt)}</Text>
        </Fact>
      </SimpleGrid>

      <FormSettings
        id={form.id}
        name={form.name}
        recipients={form.recipients}
      />
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

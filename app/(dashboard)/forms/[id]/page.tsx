import { SimpleGrid, Stack, Text } from "@mantine/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCurrentVersion,
  getForm,
  getFormDraft,
} from "@/lib/forms/queries.ts";
import { formView } from "@/lib/forms/types.ts";
import { formatDate, t } from "@/lib/i18n/index.ts";
import { AnchorLink } from "../../../_components/AnchorLink.tsx";
import { FormStatusBadge } from "../FormStatusBadge.tsx";
import {
  CurrentVersionBadge,
  CurrentVersionDetails,
} from "./CurrentVersion.tsx";
import { DraftStatusProvider } from "./DraftStatus.tsx";
import { FormDesigner } from "./FormDesigner.tsx";
import { FormSettings } from "./FormSettings.tsx";
import { FormViews } from "./FormViews.tsx";
import { PublishButton } from "./PublishButton.tsx";

export async function generateMetadata({
  params,
}: PageProps<"/forms/[id]">): Promise<Metadata> {
  const form = await getForm((await params).id);
  return { title: form?.name ?? t("forms.notFoundTitle") };
}

/**
 * A form: the designer on its draft, and its settings (`?view=settings`),
 * with the version visitors see and *Veröffentlichen* above both. Forms of
 * teams the person does not belong to are not found (RLS); every member of
 * the owning team may edit the draft, publish it and change the settings.
 */
export default async function FormPage({
  params,
  searchParams,
}: PageProps<"/forms/[id]">) {
  const { id } = await params;
  const [form, draft] = await Promise.all([getForm(id), getFormDraft(id)]);
  if (!form || !draft) notFound();
  const current = await getCurrentVersion(form);

  return (
    <DraftStatusProvider>
      <FormViews
        title={form.name}
        subtitle={form.id}
        initialView={formView((await searchParams).view)}
        actions={{
          // Settings have their own primary button (ui-design §1).
          designer: (
            <PublishButton
              formId={form.id}
              currentVersion={form.currentVersion}
              hasRecipients={form.recipients.length > 0}
            />
          ),
        }}
        status={<CurrentVersionBadge current={current} />}
        views={{
          designer: <FormDesigner formId={form.id} draft={draft} />,
          settings: (
            <>
              <SimpleGrid cols={{ base: 1, sm: 2 }} mt="xl" maw={800}>
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
                <Fact label={t("forms.detailVersion")}>
                  <CurrentVersionDetails current={current} />
                </Fact>
              </SimpleGrid>

              <FormSettings
                id={form.id}
                name={form.name}
                recipients={form.recipients}
              />
            </>
          ),
        }}
      />
    </DraftStatusProvider>
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

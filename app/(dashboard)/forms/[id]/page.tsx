import { Alert, Group, SimpleGrid, Stack, Text } from "@mantine/core";
import { IconArchive } from "@tabler/icons-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/profile.ts";
import {
  getCurrentVersion,
  getForm,
  getFormDraft,
  getFormStatistics,
  listDeliveryFailures,
  listFormPasses,
  listFormVersions,
} from "@/lib/forms/queries.ts";
import { statisticsPeriod } from "@/lib/forms/statistics.ts";
import { formView } from "@/lib/forms/types.ts";
import { formatDate, formatDateTime, t } from "@/lib/i18n/index.ts";
import { passPlaceholders } from "@/lib/shared/notification.ts";
import { AnchorLink } from "../../../_components/AnchorLink.tsx";
import { FormStatusBadge } from "../FormStatusBadge.tsx";
import {
  CurrentVersionBadge,
  CurrentVersionDetails,
} from "./CurrentVersion.tsx";
import { DeliveryFailures } from "./DeliveryFailures.tsx";
import { DiscardButton } from "./DraftReset.tsx";
import { DraftStatusProvider } from "./DraftStatus.tsx";
import { EmailTemplateEditor } from "./EmailTemplateEditor.tsx";
import { FormDesigner } from "./FormDesigner.tsx";
import { FormEmbed } from "./FormEmbed.tsx";
import { FormLifecycle } from "./FormLifecycle.tsx";
import { FormPasses } from "./FormPasses.tsx";
import { FormSettings } from "./FormSettings.tsx";
import { FormStatisticsView } from "./FormStatistics.tsx";
import { FormViews } from "./FormViews.tsx";
import { PublishButton } from "./PublishButton.tsx";
import { VersionHistory } from "./VersionHistory.tsx";

export async function generateMetadata({
  params,
}: PageProps<"/forms/[id]">): Promise<Metadata> {
  const form = await getForm((await params).id);
  return { title: form?.name ?? t("forms.notFoundTitle") };
}

/**
 * A form: the designer and the email editor on its draft, its version
 * history, its settings, its form passes, its statistics and its delivery
 * failures (`?view=email`, `?view=versions`, `?view=settings`,
 * `?view=embed`, `?view=passes`, `?view=statistics` with `&period=`, `?view=failures`),
 * with the version visitors see above all of them and *Veröffentlichen* and
 * *Änderungen verwerfen* next to the draft's editors. Forms of teams the
 * person does not belong to are not found (RLS); every member of the owning
 * team may edit the draft, publish it, restore a version, discard changes,
 * change the settings, create and revoke form passes, see its statistics,
 * retry failed deliveries, and archive the form. Only Super Admins see
 * *Endgültig löschen*. An archived form still opens here, with a notice, so
 * it can be taken out of the archive.
 */
export default async function FormPage({
  params,
  searchParams,
}: PageProps<"/forms/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const period = statisticsPeriod(search.period);
  const [profile, form, draft] = await Promise.all([
    requireProfile(),
    getForm(id),
    getFormDraft(id),
  ]);
  if (!form || !draft) notFound();
  const [current, versions, passes, failures, statistics] = await Promise.all([
    getCurrentVersion(form),
    listFormVersions(form.id),
    listFormPasses(form.id),
    listDeliveryFailures(form.id),
    getFormStatistics(form.id, period),
  ]);
  const draftActions = (
    <Group gap="xs" wrap="nowrap">
      {form.currentVersion !== null && (
        <DiscardButton formId={form.id} currentVersion={form.currentVersion} />
      )}
      <PublishButton
        formId={form.id}
        currentVersion={form.currentVersion}
        hasRecipients={form.recipients.length > 0}
      />
    </Group>
  );

  return (
    <DraftStatusProvider
      initialSchema={draft.schema}
      initialStamp={draft.stamp}
    >
      <FormViews
        title={form.name}
        subtitle={form.id}
        initialView={formView(search.view)}
        actions={{
          // Settings have their own primary button (ui-design §1).
          designer: draftActions,
          email: draftActions,
        }}
        status={
          <Stack gap="sm" align="flex-start">
            <CurrentVersionBadge current={current} />
            {form.archivedAt && (
              <Alert
                variant="outline"
                color="gray"
                icon={<IconArchive size={16} stroke={1.5} />}
                role="status"
                w="100%"
              >
                {t("forms.archivedNotice", {
                  at: formatDateTime(form.archivedAt),
                })}
              </Alert>
            )}
          </Stack>
        }
        views={{
          designer: (
            <FormDesigner
              formId={form.id}
              schema={draft.schema}
              theme={draft.theme}
            />
          ),
          email: (
            <EmailTemplateEditor
              formId={form.id}
              formName={form.name}
              initialTemplate={draft.emailTemplate}
              passPlaceholders={
                form.accessType === "protected"
                  ? passPlaceholders(passes.map((pass) => pass.metadata))
                  : null
              }
            />
          ),
          versions: (
            <VersionHistory
              formId={form.id}
              versions={versions}
              currentVersion={form.currentVersion}
            />
          ),
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
                senderDisplayName={form.senderDisplayName}
                replyToQuestion={form.replyToQuestion}
                emailQuestions={current?.emailQuestions ?? null}
                turnstileEnabled={form.turnstileEnabled}
                isClosed={form.isClosed}
                accessType={form.accessType}
                pageUrl={form.pageUrl}
              />

              <FormLifecycle
                id={form.id}
                name={form.name}
                archived={form.archivedAt !== null}
                canDelete={profile.isSuperAdmin}
              />
            </>
          ),
          embed: (
            <FormEmbed
              formId={form.id}
              pageUrl={form.pageUrl}
              accessType={form.accessType}
            />
          ),
          passes: (
            <FormPasses
              formId={form.id}
              accessType={form.accessType}
              hasPage={form.pageUrl !== null}
              passes={passes}
            />
          ),
          statistics: statistics && (
            <FormStatisticsView period={period} statistics={statistics} />
          ),
          failures: <DeliveryFailures failures={failures} />,
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

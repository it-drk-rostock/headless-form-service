import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/profile.ts";
import { t } from "@/lib/i18n/index.ts";
import { getSettings } from "@/lib/settings/queries.ts";
import { ContentPanel } from "../../_components/ContentPanel.tsx";
import { SettingsForm } from "./SettingsForm.tsx";

export const metadata: Metadata = { title: t("settings.title") };

/**
 * The global settings, for Super Admins: allowed origins, allowed
 * recipient domains and rate limits.
 * For everyone else this page does not exist.
 */
export default async function SettingsPage() {
  const profile = await requireProfile();
  if (!profile.isSuperAdmin) notFound();
  const settings = await getSettings();
  if (!settings) notFound();

  return (
    <ContentPanel title={t("settings.title")}>
      <SettingsForm {...settings} />
    </ContentPanel>
  );
}

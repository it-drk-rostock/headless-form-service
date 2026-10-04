import { Stack, Text, Title } from "@mantine/core";
import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth/profile.ts";
import { t } from "@/lib/i18n/index.ts";
import { SetPasswordForm } from "./SetPasswordForm.tsx";

export const metadata: Metadata = { title: t("auth.setPasswordTitle") };

/** Where invite and set-password links land, after `/auth/confirm` signed the person in. */
export default async function SetPasswordPage() {
  const profile = await requireProfile();

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={1}>{t("auth.setPasswordTitle")}</Title>
        <Text c="gray.6" fz={13}>
          {t("auth.setPasswordIntro", { email: profile.email })}
        </Text>
      </Stack>
      <SetPasswordForm email={profile.email} />
    </Stack>
  );
}

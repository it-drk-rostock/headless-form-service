import { Stack, Text, Title } from "@mantine/core";
import type { Metadata } from "next";
import { t } from "@/lib/i18n/index.ts";
import { FormError } from "../../_components/FormError.tsx";
import { LoginForm } from "./LoginForm.tsx";

export const metadata: Metadata = { title: t("auth.loginTitle") };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Title order={1}>{t("auth.loginTitle")}</Title>
        <Text c="gray.6" fz={13}>
          {t("auth.loginIntro")}
        </Text>
      </Stack>
      {error === "link" && <FormError>{t("auth.errorLinkInvalid")}</FormError>}
      <LoginForm next={typeof next === "string" ? next : ""} />
      {/* No self-service reset (blueprint §2.3): admins send set-password links. */}
      <Text c="gray.6" fz={13}>
        {t("auth.loginHelp")}
      </Text>
    </Stack>
  );
}

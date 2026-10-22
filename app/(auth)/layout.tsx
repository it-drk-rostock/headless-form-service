import { Center, Paper, Stack, Text } from "@mantine/core";
import { t } from "@/lib/i18n/index.ts";
import { LogoTile } from "../_components/LogoTile.tsx";

/** Centred card on the grey app background for the pages outside the shell. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <Center mih="100dvh" bg="gray.0" p="md">
      <Stack w="100%" maw={380} gap="md">
        <Stack align="center" gap="xs">
          <LogoTile full />
          <Text fw={600}>{t("app.title")}</Text>
        </Stack>
        <Paper withBorder radius="md" p="lg">
          {children}
        </Paper>
      </Stack>
    </Center>
  );
}

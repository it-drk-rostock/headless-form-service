import { Stack, Text, ThemeIcon, Title } from "@mantine/core";

/** Centred empty state (docs/ui-design.md §5): light icon, short title, one-line hint. */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <Stack align="center" gap="xs" py={64}>
      <ThemeIcon variant="light" color="gray" size={48} radius="xl">
        {icon}
      </ThemeIcon>
      <Title order={2}>{title}</Title>
      <Text c="gray.6" fz={13}>
        {hint}
      </Text>
    </Stack>
  );
}

import { Box, Group, Paper, Text, Title } from "@mantine/core";

/**
 * White content panel with the page header (docs/ui-design.md §4–5): title,
 * an optional monospace ID below it, and page actions top right.
 */
export function ContentPanel({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper
      withBorder
      radius="md"
      m="md"
      p="lg"
      mih="calc(100dvh - var(--app-shell-header-height) - 2 * var(--mantine-spacing-md))"
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box miw={0}>
          <Title order={1}>{title}</Title>
          {subtitle && (
            <Text ff="monospace" fz={13} c="gray.6" mt={4}>
              {subtitle}
            </Text>
          )}
        </Box>
        {actions}
      </Group>
      {children}
    </Paper>
  );
}

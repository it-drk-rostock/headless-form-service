import { Paper, Title } from "@mantine/core";

/** White content panel with the page title (docs/ui-design.md §4–5). */
export function ContentPanel({
  title,
  children,
}: {
  title: string;
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
      <Title order={1}>{title}</Title>
      {children}
    </Paper>
  );
}

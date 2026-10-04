import { Alert } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";

/** Error above a form: red, with an icon and explicit text (docs/ui-design.md §2.3). */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <Alert color="red" icon={<IconAlertCircle size={16} stroke={1.5} />}>
      {children}
    </Alert>
  );
}

import { Badge } from "@mantine/core";
import type { FormStatus } from "@/lib/forms/types.ts";
import { t } from "@/lib/i18n/index.ts";

// Red is the brand, so no status uses it (ui-design §2.3).
const colors: Record<FormStatus, string> = {
  draft: "gray",
  published: "green",
  closed: "orange",
  archived: "gray",
};

/** A form's status as a dot badge, e.g. `● Veröffentlicht`. */
export function FormStatusBadge({ status }: { status: FormStatus }) {
  return (
    <Badge variant="dot" color={colors[status]} radius="xl" tt="none" fw={500}>
      {t(`forms.status.${status}`)}
    </Badge>
  );
}

"use client";

import { SegmentedControl } from "@mantine/core";
import { useRouter } from "next/navigation";
import type { FormsFilter } from "@/lib/forms/types.ts";
import { t } from "@/lib/i18n/index.ts";

/**
 * Switches `/forms` between the forms in use and the archived ones. The URL
 * follows (`?filter=archived`), so a reload or a shared link opens it again.
 */
export function FormsFilterControl({ filter }: { filter: FormsFilter }) {
  const router = useRouter();
  return (
    <SegmentedControl
      size="xs"
      value={filter}
      onChange={(value) =>
        router.push(value === "archived" ? "/forms?filter=archived" : "/forms")
      }
      data={[
        { value: "active", label: t("forms.filterActive") },
        { value: "archived", label: t("forms.filterArchived") },
      ]}
    />
  );
}

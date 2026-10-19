"use client";

import { SegmentedControl } from "@mantine/core";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormsFilter, formsListHref } from "@/lib/forms/types.ts";
import { t } from "@/lib/i18n/index.ts";

/**
 * Switches `/forms` between the forms in use and the archived ones. The URL
 * follows (`?filter=archived`), so a reload or a shared link opens it again.
 */
export function FormsFilterControl({ filter }: { filter: FormsFilter }) {
  const router = useRouter();
  const search = useSearchParams();
  return (
    <SegmentedControl
      size="xs"
      value={filter}
      onChange={(value) =>
        router.push(
          formsListHref(
            value === "archived" ? "archived" : "active",
            search.get("team"),
          ),
        )
      }
      data={[
        { value: "active", label: t("forms.filterActive") },
        { value: "archived", label: t("forms.filterArchived") },
      ]}
    />
  );
}

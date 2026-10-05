"use client";

import {
  Anchor,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from "@mantine/core";
import Link from "next/link";
import type { FormSummary } from "@/lib/forms/types.ts";
import { formatDate, t } from "@/lib/i18n/index.ts";
import { FormStatusBadge } from "./FormStatusBadge.tsx";

/** Forms as a plain table (ui-design §5), with the owning team. */
export function FormsTable({ forms }: { forms: FormSummary[] }) {
  return (
    <Table highlightOnHover verticalSpacing="sm" fz={13} mt="lg">
      <TableThead>
        <TableTr>
          <TableTh c="gray.6" fw={500}>
            {t("forms.columnName")}
          </TableTh>
          <TableTh c="gray.6" fw={500}>
            {t("forms.columnTeam")}
          </TableTh>
          <TableTh c="gray.6" fw={500}>
            {t("forms.columnStatus")}
          </TableTh>
          <TableTh c="gray.6" fw={500}>
            {t("forms.columnUpdated")}
          </TableTh>
        </TableTr>
      </TableThead>
      <TableTbody>
        {forms.map((form) => (
          <TableTr key={form.id}>
            <TableTd>
              <Anchor component={Link} href={`/forms/${form.id}`} fz={13}>
                {form.name}
              </Anchor>
            </TableTd>
            <TableTd>
              <Text fz={13}>{form.teamName}</Text>
            </TableTd>
            <TableTd>
              <FormStatusBadge status={form.status} />
            </TableTd>
            <TableTd>
              <Text fz={13} c="gray.6">
                {formatDate(form.updatedAt)}
              </Text>
            </TableTd>
          </TableTr>
        ))}
      </TableTbody>
    </Table>
  );
}

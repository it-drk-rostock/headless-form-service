import "server-only";
import { cache } from "react";
import { requireProfile } from "../auth/profile.ts";
import { createClient } from "../supabase/server.ts";
import {
  DRAFT_STAMP_COLUMNS,
  type DraftSchema,
  type DraftStampRow,
  type FormDraft,
  toDraftStamp,
} from "./draft.ts";
import { isFormId } from "./id.ts";
import {
  CURRENT_VERSION_COLUMNS,
  type CurrentVersion,
  type CurrentVersionRow,
  toCurrentVersion,
} from "./publish.ts";
import { type FormDetails, type FormSummary, formStatus } from "./types.ts";

type FormRow = {
  id: string;
  name: string;
  team_id: string;
  is_closed: boolean;
  archived_at: string | null;
  current_version: number | null;
  recipients: string[];
  turnstile_enabled: boolean;
  created_at: string;
  updated_at: string;
  teams: { name: string };
};

const FORM_COLUMNS =
  "id, name, team_id, is_closed, archived_at, current_version, recipients, turnstile_enabled, created_at, updated_at, teams(name)";

function toSummary(row: FormRow): FormSummary {
  return {
    id: row.id,
    name: row.name,
    teamId: row.team_id,
    teamName: row.teams.name,
    status: formStatus({
      archivedAt: row.archived_at,
      isClosed: row.is_closed,
      currentVersion: row.current_version,
    }),
    updatedAt: row.updated_at,
  };
}

/**
 * The forms of every team the signed-in person belongs to (of every team for
 * a Super Admin), without archived ones. RLS decides which rows come back.
 */
export const listMyForms = cache(async (): Promise<FormSummary[]> => {
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .select(FORM_COLUMNS)
    .is("archived_at", null)
    .order("name")
    .overrideTypes<FormRow[], { merge: false }>();
  if (error) throw new Error(`Forms could not be loaded: ${error.message}`);
  return data.map(toSummary);
});

/** One form, or null when it does not exist or the person may not see it. */
export const getForm = cache(
  async (id: string): Promise<FormDetails | null> => {
    if (!isFormId(id)) return null;
    await requireProfile();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("forms")
      .select(FORM_COLUMNS)
      .eq("id", id)
      .maybeSingle()
      .overrideTypes<FormRow, { merge: false }>();
    if (error) {
      throw new Error(`Form ${id} could not be loaded: ${error.message}`);
    }
    if (!data) return null;
    return {
      ...toSummary(data),
      recipients: data.recipients,
      turnstileEnabled: data.turnstile_enabled,
      currentVersion: data.current_version,
      createdAt: data.created_at,
    };
  },
);

/**
 * A form's draft questions with who saved them last, for the designer. Null
 * when the form does not exist or the person may not see it.
 */
export async function getFormDraft(id: string): Promise<FormDraft | null> {
  if (!isFormId(id)) return null;
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .select(`draft_schema, ${DRAFT_STAMP_COLUMNS}`)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<
      DraftStampRow & { draft_schema: DraftSchema },
      { merge: false }
    >();
  if (error) {
    throw new Error(
      `Draft of form ${id} could not be loaded: ${error.message}`,
    );
  }
  if (!data) return null;
  return { schema: data.draft_schema, stamp: toDraftStamp(data) };
}

/**
 * The current version of a form with who published it and when, or null
 * while the form is not yet published.
 */
export async function getCurrentVersion(
  form: Pick<FormDetails, "id" | "currentVersion">,
): Promise<CurrentVersion | null> {
  if (form.currentVersion === null) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_versions")
    .select(CURRENT_VERSION_COLUMNS)
    .eq("form_id", form.id)
    .eq("version", form.currentVersion)
    .single()
    .overrideTypes<CurrentVersionRow, { merge: false }>();
  if (error) {
    throw new Error(
      `Version ${form.currentVersion} of form ${form.id} could not be loaded: ${error.message}`,
    );
  }
  return toCurrentVersion(data);
}

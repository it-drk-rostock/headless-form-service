import "server-only";
import { cache } from "react";
import { requireProfile } from "../auth/profile.ts";
import { parseEmailTemplate } from "../shared/notification.ts";
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
  FORM_VERSION_COLUMNS,
  type FormVersion,
  type FormVersionRow,
  toCurrentVersion,
  toFormVersion,
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
  reply_to_question: string | null;
  sender_display_name: string;
  created_at: string;
  updated_at: string;
  teams: { name: string };
};

const FORM_COLUMNS =
  "id, name, team_id, is_closed, archived_at, current_version, recipients, turnstile_enabled, reply_to_question, sender_display_name, created_at, updated_at, teams(name)";

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
      isClosed: data.is_closed,
      replyToQuestion: data.reply_to_question,
      senderDisplayName: data.sender_display_name,
      currentVersion: data.current_version,
      createdAt: data.created_at,
    };
  },
);

/**
 * A form's draft questions and email template with who saved them last, for
 * the designer and the email editor. Null when the form does not exist or
 * the person may not see it.
 */
export async function getFormDraft(id: string): Promise<FormDraft | null> {
  if (!isFormId(id)) return null;
  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .select(`draft_schema, draft_email_template, ${DRAFT_STAMP_COLUMNS}`)
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<
      DraftStampRow & {
        draft_schema: DraftSchema;
        draft_email_template: unknown;
      },
      { merge: false }
    >();
  if (error) {
    throw new Error(
      `Draft of form ${id} could not be loaded: ${error.message}`,
    );
  }
  if (!data) return null;
  // The database only stores templates of this shape.
  const emailTemplate = parseEmailTemplate(data.draft_email_template);
  if (!emailTemplate) {
    throw new Error(`Draft of form ${id} has no readable email template`);
  }
  return {
    schema: data.draft_schema,
    emailTemplate,
    stamp: toDraftStamp(data),
  };
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

/**
 * Every version of a form, newest first, with who published it, when, and
 * its changelog. RLS shows them to the people who see the form.
 */
export async function listFormVersions(id: string): Promise<FormVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_versions")
    .select(FORM_VERSION_COLUMNS)
    .eq("form_id", id)
    .order("version", { ascending: false })
    .overrideTypes<FormVersionRow[], { merge: false }>();
  if (error) {
    throw new Error(
      `Versions of form ${id} could not be loaded: ${error.message}`,
    );
  }
  return data.map(toFormVersion);
}

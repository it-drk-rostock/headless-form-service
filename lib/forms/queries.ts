import type { ITheme } from "survey-core";
import "server-only";
import { cache } from "react";
import { requireProfile } from "../auth/profile.ts";
import { parseEmailTemplate } from "../shared/notification.ts";
import { createClient } from "../supabase/server.ts";
import {
  DELIVERY_FAILURE_COLUMNS,
  type DeliveryFailure,
  type DeliveryFailureRow,
  toDeliveryFailure,
} from "./delivery-failures.ts";
import {
  DRAFT_STAMP_COLUMNS,
  type DraftSchema,
  type DraftStampRow,
  type FormDraft,
  toDraftStamp,
} from "./draft.ts";
import { isFormId } from "./id.ts";
import {
  FORM_PASS_COLUMNS,
  type FormPass,
  type FormPassRow,
  toFormPass,
} from "./passes.ts";
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
import {
  type FormStatistics,
  parseFormStatistics,
  type StatisticsPeriod,
} from "./statistics.ts";
import {
  type FormAccessType,
  type FormDetails,
  type FormSummary,
  type FormsFilter,
  formStatus,
} from "./types.ts";

type FormRow = {
  id: string;
  name: string;
  team_id: string;
  is_closed: boolean;
  archived_at: string | null;
  access_type: FormAccessType;
  page_url: string | null;
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
  "id, name, team_id, is_closed, archived_at, access_type, page_url, current_version, recipients, turnstile_enabled, reply_to_question, sender_display_name, created_at, updated_at, teams(name)";

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
 * a Super Admin): those in use, or only the archived ones. RLS decides which
 * rows come back.
 */
export const listMyForms = cache(
  async (filter: FormsFilter = "active"): Promise<FormSummary[]> => {
    await requireProfile();
    const supabase = await createClient();
    const query = supabase.from("forms").select(FORM_COLUMNS);
    const { data, error } = await (filter === "archived"
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null)
    )
      .order("name")
      .overrideTypes<FormRow[], { merge: false }>();
    if (error) throw new Error(`Forms could not be loaded: ${error.message}`);
    return data.map(toSummary);
  },
);

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
      archivedAt: data.archived_at,
      accessType: data.access_type,
      pageUrl: data.page_url,
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
    .select(
      `draft_schema, draft_email_template, draft_theme, ${DRAFT_STAMP_COLUMNS}`,
    )
    .eq("id", id)
    .maybeSingle()
    .overrideTypes<
      DraftStampRow & {
        draft_schema: DraftSchema;
        draft_email_template: unknown;
        draft_theme: ITheme | null;
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
    theme: data.draft_theme,
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

/**
 * A form's passes, newest first, with their status now. RLS shows them to
 * the people who see the form; nobody reads their hashes.
 */
export async function listFormPasses(id: string): Promise<FormPass[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_passes")
    .select(FORM_PASS_COLUMNS)
    .eq("form_id", id)
    .order("created_at", { ascending: false })
    .overrideTypes<FormPassRow[], { merge: false }>();
  if (error) {
    throw new Error(
      `Form passes of form ${id} could not be loaded: ${error.message}`,
    );
  }
  const now = new Date();
  return data.map((row) => toFormPass(row, now));
}

/**
 * A form's delivery failures, newest first: the submissions that failed, and
 * those queued again by a retry until they are sent. Metadata only; RLS
 * shows them to the people who see the form.
 */
export async function listDeliveryFailures(
  id: string,
): Promise<DeliveryFailure[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_stats")
    .select(DELIVERY_FAILURE_COLUMNS)
    .eq("form_id", id)
    .neq("status", "sent")
    .or("status.eq.failed,retried_at.not.is.null")
    .order("submitted_at", { ascending: false })
    .overrideTypes<DeliveryFailureRow[], { merge: false }>();
  if (error) {
    throw new Error(
      `Delivery failures of form ${id} could not be loaded: ${error.message}`,
    );
  }
  const now = new Date();
  return data.map((row) => toDeliveryFailure(row, now));
}

/**
 * A form's statistics for the last `days` Berlin days (today by hour for 1),
 * or null when the person may not see the form. Counted in the database
 * (`public.form_statistics`), which runs as the person, so RLS decides.
 */
export async function getFormStatistics(
  id: string,
  days: StatisticsPeriod,
): Promise<FormStatistics | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("form_statistics", {
    form: id,
    days,
  });
  if (error) {
    throw new Error(
      `Statistics of form ${id} could not be loaded: ${error.message}`,
    );
  }
  return parseFormStatistics(data);
}

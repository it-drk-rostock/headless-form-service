"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "../auth/profile.ts";
import type { MessageKey } from "../i18n/index.ts";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "../teams/id.ts";
import {
  DRAFT_STAMP_COLUMNS,
  type DraftStamp,
  type DraftStampRow,
  draftSchemaProblem,
  toDraftStamp,
} from "./draft.ts";
import { isFormId } from "./id.ts";
import { formNameProblem } from "./name.ts";
import { changelogProblem, normalizeChangelog } from "./publish.ts";
import { parseRecipients } from "./recipients.ts";

/**
 * `address` fills the `{address}` placeholder of the message. `savedAt`
 * changes on every successful save, so the form can say so.
 */
export type FormActionState = {
  error: MessageKey | null;
  address?: string;
  savedAt?: number;
};

// The database refuses with "insufficient_privilege" when RLS rejects a write.
const INSUFFICIENT_PRIVILEGE = "42501";
const DRAFT_WITHOUT_QUESTIONS = "HF003"; // raised by public.publish_form()

/**
 * Creates a form for one of the person's teams and opens it. Any member of
 * the team may, and Super Admins for every team; RLS enforces it.
 */
export async function createForm(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const name = String(formData.get("name") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const problem = formNameProblem(name);
  if (problem) return { error: problem };
  if (!isTeamId(teamId)) return { error: "forms.errorTeamMissing" };

  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .insert({ team_id: teamId, name: name.trim() })
    .select("id")
    .single();
  if (error) return { error: writeError(error) };

  redirect(`/forms/${data.id}`);
}

/**
 * Saves a form's name, recipients and Turnstile switch. The database records
 * the changes in the audit log, in the same transaction.
 */
export async function updateFormSettings(
  _previous: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  const problem = formNameProblem(name);
  if (problem) return { error: problem };
  const parsed = parseRecipients(String(formData.get("recipients") ?? ""));
  if ("error" in parsed) return parsed;
  if (!isFormId(id)) return { error: "forms.errorForbidden" };
  // An unchecked switch sends nothing.
  const turnstileEnabled = formData.get("turnstileEnabled") === "on";

  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .update({
      name: name.trim(),
      recipients: parsed.recipients,
      turnstile_enabled: turnstileEnabled,
    })
    .eq("id", id)
    .select("id");
  if (error) return { error: writeError(error) };
  // RLS hides rows the person may not change, so nothing matched.
  if (data.length === 0) return { error: "forms.errorForbidden" };

  refresh();
  return { error: null, savedAt: Date.now() };
}

export type DraftSaveResult =
  | { error: MessageKey }
  | { error: null; stamp: DraftStamp };

/**
 * Saves the designer's questions into the form's single draft. Concurrent
 * saves are last-write-wins; the database stamps who saved and when. Visitors
 * keep seeing the current version until the draft is published.
 */
export async function saveDraft(
  id: string,
  schema: unknown,
): Promise<DraftSaveResult> {
  const problem = draftSchemaProblem(schema);
  if (problem) return { error: problem };
  if (!isFormId(id)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .update({ draft_schema: schema })
    .eq("id", id)
    .select(DRAFT_STAMP_COLUMNS)
    .overrideTypes<DraftStampRow[], { merge: false }>();
  if (error) return { error: writeError(error) };
  // RLS hides rows the person may not change, so nothing matched.
  if (data.length === 0) return { error: "forms.errorForbidden" };

  return { error: null, stamp: toDraftStamp(data[0]) };
}

export type PublishResult =
  | { error: MessageKey }
  | { error: null; version: number };

/**
 * Publishes the form's draft: its questions and email template become the
 * next form version, which visitors are served from now on. The database
 * does this in one transaction, with its audit log entry.
 */
export async function publishForm(
  id: string,
  changelog: string,
): Promise<PublishResult> {
  const problem = changelogProblem(changelog);
  if (problem) return { error: problem };
  if (!isFormId(id)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_form", {
    form: id,
    changelog: normalizeChangelog(changelog),
  });
  if (error) {
    if (error.code === DRAFT_WITHOUT_QUESTIONS) {
      return { error: "forms.errorPublishEmpty" };
    }
    return { error: writeError(error) };
  }

  refresh();
  return { error: null, version: data as number };
}

function writeError(error: PostgrestError): MessageKey {
  if (error.code === INSUFFICIENT_PRIVILEGE) return "forms.errorForbidden";
  console.error("Form could not be saved", error);
  return "forms.errorGeneric";
}

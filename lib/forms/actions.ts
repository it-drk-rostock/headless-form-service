"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "../auth/profile.ts";
import type { MessageKey } from "../i18n/index.ts";
import {
  emailQuestions,
  normalizeSenderName,
  parseEmailTemplate,
} from "../shared/notification.ts";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "../teams/id.ts";
import {
  DRAFT_STAMP_COLUMNS,
  type DraftStamp,
  type DraftStampRow,
  draftSchemaProblem,
  toDraftStamp,
} from "./draft.ts";
import { emailTemplateProblem } from "./email-template.ts";
import { isFormId } from "./id.ts";
import { formNameProblem } from "./name.ts";
import { changelogProblem, normalizeChangelog } from "./publish.ts";
import { parseRecipients } from "./recipients.ts";
import { parseReplyToQuestion } from "./reply-to.ts";
import { senderNameProblem } from "./sender-name.ts";

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
 * Saves a form's name, recipients, sender display name, Reply-To question
 * and Turnstile switch. The database records the changes in the audit log,
 * in the same transaction.
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
  const senderName = normalizeSenderName(
    String(formData.get("senderDisplayName") ?? ""),
  );
  const senderProblem = senderNameProblem(senderName);
  if (senderProblem) return { error: senderProblem };
  if (!isFormId(id)) return { error: "forms.errorForbidden" };
  // An unchecked switch sends nothing.
  const turnstileEnabled = formData.get("turnstileEnabled") === "on";

  await requireProfile();
  const supabase = await createClient();
  const replyTo = await parseReplyTo(
    supabase,
    id,
    String(formData.get("replyToQuestion") ?? ""),
  );
  if ("error" in replyTo) return replyTo;
  const { data, error } = await supabase
    .from("forms")
    .update({
      name: name.trim(),
      recipients: parsed.recipients,
      sender_display_name: senderName,
      reply_to_question: replyTo.replyToQuestion,
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

/**
 * The chosen Reply-To question, checked against the email questions of the
 * form's current version as the database has it now.
 */
async function parseReplyTo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  input: string,
): Promise<ReturnType<typeof parseReplyToQuestion>> {
  if (input === "") return { replyToQuestion: null };
  const { data: form, error } = await supabase
    .from("forms")
    .select("reply_to_question, current_version")
    .eq("id", id)
    .maybeSingle<{
      reply_to_question: string | null;
      current_version: number | null;
    }>();
  if (error) return { error: writeError(error) };
  // RLS hides forms the person may not see.
  if (!form) return { error: "forms.errorForbidden" };

  let choices: string[] = [];
  if (form.current_version !== null) {
    const { data: version, error: versionError } = await supabase
      .from("form_versions")
      .select("schema")
      .eq("form_id", id)
      .eq("version", form.current_version)
      .single<{ schema: unknown }>();
    if (versionError) return { error: writeError(versionError) };
    choices = emailQuestions(version.schema).map((question) => question.name);
  }
  return parseReplyToQuestion(input, {
    choices,
    stored: form.reply_to_question,
  });
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
  return updateDraft(id, { draft_schema: schema });
}

/**
 * Saves the email editor's subject and body into the form's single draft,
 * like `saveDraft` does the questions. Recipients keep getting the current
 * version's template until the draft is published (ADR-0003).
 */
export async function saveEmailTemplate(
  id: string,
  template: unknown,
): Promise<DraftSaveResult> {
  const problem = emailTemplateProblem(template);
  if (problem) return { error: problem };
  // Only the template's own fields, nothing else the client sent.
  return updateDraft(id, {
    draft_email_template: parseEmailTemplate(template),
  });
}

/** Writes a part of the form's draft, which the database stamps. */
async function updateDraft(
  id: string,
  part: { draft_schema: unknown } | { draft_email_template: unknown },
): Promise<DraftSaveResult> {
  if (!isFormId(id)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .update(part)
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

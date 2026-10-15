"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "../auth/profile.ts";
import type { MessageKey } from "../i18n/index.ts";
import {
  formPassUrl,
  generateFormPassSecret,
  hashFormPassSecret,
} from "../shared/form-pass.ts";
import {
  emailQuestions,
  normalizeSenderName,
  parseEmailTemplate,
} from "../shared/notification.ts";
import { isObject } from "../shared/object.ts";
import { isUuid } from "../shared/uuid.ts";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "../teams/id.ts";
import { createDeadLetterQueue } from "./dead-letter-queue.ts";
import { type RetryOutcome, retryDelivery } from "./delivery-failures.ts";
import {
  DRAFT_STAMP_COLUMNS,
  type DraftStamp,
  type DraftStampRow,
  draftSchemaProblem,
  type FormDraft,
  toDraftStamp,
} from "./draft.ts";
import { emailTemplateProblem } from "./email-template.ts";
import { isFormId } from "./id.ts";
import { confirmsDeletion, formNameProblem } from "./name.ts";
import {
  type FormPassInput,
  parseFormPage,
  parseFormPassInput,
} from "./passes.ts";
import { changelogProblem, normalizeChangelog } from "./publish.ts";
import { getFormDraft } from "./queries.ts";
import { parseRecipients } from "./recipients.ts";
import { parseReplyToQuestion } from "./reply-to.ts";
import { senderNameProblem } from "./sender-name.ts";
import { isFormAccessType } from "./types.ts";

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
const VERSION_NOT_FOUND = "HF007"; // raised by public.restore_form_version()
const NOT_YET_PUBLISHED = "HF008"; // raised by public.discard_draft_changes()
const FORM_NOT_FOUND = "HF009"; // raised by public.delete_form()
const FORM_NOT_PROTECTED = "HF010"; // raised by public.create_form_pass()
const NOT_RETRYABLE = "HF011"; // raised by public.delivery_retry_message()
// Raised by private.check_recipient_domains(), with the address as detail.
const RECIPIENT_DOMAIN_NOT_ALLOWED = "HF006";

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
 * Saves a form's name, recipients, sender display name, Reply-To question,
 * Turnstile switch, access type and form page. The database records the
 * changes in the audit log, in the same transaction.
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
  const page = parseFormPage(String(formData.get("pageUrl") ?? ""));
  if ("error" in page) return page;
  const accessType = formData.get("accessType");
  if (!isFormAccessType(accessType)) return { error: "forms.errorGeneric" };
  if (!isFormId(id)) return { error: "forms.errorForbidden" };
  // An unchecked switch sends nothing.
  const turnstileEnabled = formData.get("turnstileEnabled") === "on";
  // Written only when switched, so a save from a page opened before someone
  // else closed or reopened the form does not undo that.
  const isClosed = formData.get("isClosed") === "on";
  const closedChanged = isClosed !== (formData.get("wasClosed") === "true");

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
      access_type: accessType,
      page_url: page.pageUrl,
      ...(closedChanged ? { is_closed: isClosed } : {}),
    })
    .eq("id", id)
    .select("id");
  // Members cannot read the allowed recipient domains, so the database checks.
  if (error?.code === RECIPIENT_DOMAIN_NOT_ALLOWED) {
    return {
      error: "forms.errorRecipientDomainNotAllowed",
      address: error.details,
    };
  }
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

/** Saves only the appearance choice; null returns the draft to inheritance. */
export async function saveDraftTheme(
  id: string,
  theme: unknown,
): Promise<DraftSaveResult> {
  if (theme !== null && !isObject(theme))
    return { error: "forms.errorDraftInvalid" };
  return updateDraft(id, { draft_theme: theme });
}

/** Writes a part of the form's draft, which the database stamps. */
async function updateDraft(
  id: string,
  part:
    | { draft_schema: unknown }
    | { draft_email_template: unknown }
    | { draft_theme: unknown },
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

export type DraftResetResult =
  | { error: MessageKey }
  | { error: null; draft: FormDraft };

/**
 * Restores a form version: its questions and email template replace the
 * draft, to be published again as a new version. Visitors keep seeing the
 * current version until then. The database records it in the audit log, in
 * the same transaction. Returns the draft, so the editors can reopen it.
 */
export async function restoreFormVersion(
  id: string,
  version: number,
): Promise<DraftResetResult> {
  if (!isFormId(id)) return { error: "forms.errorForbidden" };
  if (!Number.isInteger(version) || version < 1) {
    return { error: "forms.errorVersionNotFound" };
  }

  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_form_version", {
    form: id,
    version,
  });
  if (error?.code === VERSION_NOT_FOUND) {
    return { error: "forms.errorVersionNotFound" };
  }
  if (error) return { error: writeError(error) };
  return reopenedDraft(id);
}

/**
 * Discards the draft's unpublished changes: the draft is reset to the
 * current version, recorded in the audit log like restoring.
 */
export async function discardDraftChanges(
  id: string,
): Promise<DraftResetResult> {
  if (!isFormId(id)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_draft_changes", { form: id });
  if (error?.code === NOT_YET_PUBLISHED) {
    return { error: "forms.errorDiscardUnpublished" };
  }
  if (error) return { error: writeError(error) };
  return reopenedDraft(id);
}

/**
 * The draft as restoring or discarding left it. The page refreshes too, so
 * the version numbers it shows are the database's, should someone else have
 * published meanwhile.
 */
async function reopenedDraft(id: string): Promise<DraftResetResult> {
  refresh();
  try {
    const draft = await getFormDraft(id);
    return draft ? { error: null, draft } : { error: "forms.errorForbidden" };
  } catch (error) {
    console.error("Draft could not be reloaded", error);
    return { error: "forms.errorGeneric" };
  }
}

export type FormLifecycleResult = { error: MessageKey | null };

/**
 * Archives a form no longer needed: it leaves the forms list, and
 * `/load-form` and `/submit-form` refuse it, while its versions and
 * statistics stay. Members of the owning team and Super Admins may; the
 * database checks it and records it in the audit log.
 */
export async function archiveForm(id: string): Promise<FormLifecycleResult> {
  return setArchived(id, "archive_form");
}

/** Takes a form out of the archive; it is served again at once. */
export async function unarchiveForm(id: string): Promise<FormLifecycleResult> {
  return setArchived(id, "unarchive_form");
}

async function setArchived(
  id: string,
  rpc: "archive_form" | "unarchive_form",
): Promise<FormLifecycleResult> {
  if (!isFormId(id)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { form: id });
  if (error) return { error: writeError(error) };

  refresh();
  return { error: null };
}

/**
 * Deletes a form for good, with its versions and statistics, once
 * `confirmation` is its name. Only Super Admins may; the database checks it
 * and records it in the audit log. Opens the forms list afterwards.
 */
export async function deleteForm(
  id: string,
  confirmation: string,
): Promise<FormLifecycleResult> {
  if (!isFormId(id)) return { error: "forms.errorFormGone" };

  const profile = await requireProfile();
  if (!profile.isSuperAdmin) return { error: "forms.errorDeleteForbidden" };
  const supabase = await createClient();
  const { data: form, error: readError } = await supabase
    .from("forms")
    .select("name")
    .eq("id", id)
    .maybeSingle<{ name: string }>();
  if (readError) return { error: writeError(readError) };
  if (!form) return { error: "forms.errorFormGone" };
  if (!confirmsDeletion(confirmation, form.name)) {
    return { error: "forms.errorDeleteConfirm" };
  }

  const { error } = await supabase.rpc("delete_form", { form: id });
  if (error?.code === FORM_NOT_FOUND) return { error: "forms.errorFormGone" };
  if (error?.code === INSUFFICIENT_PRIVILEGE) {
    return { error: "forms.errorDeleteForbidden" };
  }
  if (error) return { error: writeError(error) };

  redirect("/forms");
}

export type FormPassCreateResult =
  | { error: MessageKey }
  | { error: null; url: string };

/**
 * Creates a form pass for a protected form with a form page, and returns its
 * link. The secret is made here and shown only this once; the database
 * keeps its hash, checks who may create passes, and records it in the audit
 * log.
 */
export async function createFormPass(
  id: string,
  input: FormPassInput,
): Promise<FormPassCreateResult> {
  const parsed = parseFormPassInput(input);
  if ("error" in parsed) return parsed;
  if (!isFormId(id)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const { data: form, error: readError } = await supabase
    .from("forms")
    .select("access_type, page_url")
    .eq("id", id)
    .maybeSingle<{ access_type: string; page_url: string | null }>();
  if (readError) return { error: writeError(readError) };
  if (!form) return { error: "forms.errorForbidden" };
  if (form.access_type !== "protected") {
    return { error: "forms.errorPassNotProtected" };
  }
  if (form.page_url === null) return { error: "forms.errorPassNoPage" };

  const secret = generateFormPassSecret();
  const { error } = await supabase.rpc("create_form_pass", {
    form: id,
    token_hash: await hashFormPassSecret(secret),
    max_uses: parsed.maxUses,
    expires_at:
      parsed.expiresInHours === null
        ? null
        : new Date(
            Date.now() + parsed.expiresInHours * 3_600_000,
          ).toISOString(),
    metadata: parsed.metadata,
  });
  if (error?.code === FORM_NOT_PROTECTED) {
    return { error: "forms.errorPassNotProtected" };
  }
  if (error) return { error: writeError(error) };

  refresh();
  return { error: null, url: formPassUrl(form.page_url, secret) };
}

export type FormPassRevokeResult = { error: MessageKey | null };

/**
 * Revokes a form pass for good. Members of the form's team and Super Admins
 * may; the database checks it and records it in the audit log.
 */
export async function revokeFormPass(
  passId: string,
): Promise<FormPassRevokeResult> {
  if (!isUuid(passId)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_form_pass", { pass: passId });
  if (error) return { error: writeError(error) };

  refresh();
  return { error: null };
}

export type DeliveryRetryResult = { error: MessageKey | null };

/**
 * *Zustellung wiederholen*: retries a failed delivery from QStash's DLQ
 * (blueprint §4.5), with the dashboard's QStash token. Members of the form's
 * team and Super Admins may; the database checks it, queues the submission
 * again and records the retry in the audit log. A message no longer in the
 * DLQ is marked so, and the list then explains why it cannot be retried.
 */
export async function retryFormDelivery(
  submissionId: string,
): Promise<DeliveryRetryResult> {
  if (!isUuid(submissionId)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    console.error("QSTASH_TOKEN is not set; see .env.example.");
    return { error: "forms.errorRetryFailed" };
  }
  const dlq = createDeadLetterQueue({
    token,
    // Must stay an EU region (ADR-0002); QStash's default is.
    baseUrl: process.env.QSTASH_URL || undefined,
  });

  let outcome: RetryOutcome;
  try {
    outcome = await retryDelivery(submissionId, {
      failedMessageId: async (id) => {
        const { data, error } = await supabase.rpc("delivery_retry_message", {
          submission: id,
        });
        if (error?.code === NOT_RETRYABLE) return null;
        if (error) throw error;
        return data as string;
      },
      retryMessage: (message) => dlq.retry(message),
      recordRetry: async (id, message) => {
        const { error } = await supabase.rpc("record_delivery_retry", {
          submission: id,
          message,
        });
        if (error) throw error;
      },
      recordGone: async (id, message) => {
        const { error } = await supabase.rpc("record_delivery_retry_gone", {
          submission: id,
          message,
        });
        if (error) throw error;
      },
    });
  } catch (error) {
    // QStash unreachable or refusing, or the database failing; also an
    // attempt by someone outside the form's team, which the dashboard never
    // offers.
    console.error(`Delivery of ${submissionId} could not be retried`, error);
    return { error: "forms.errorRetryFailed" };
  }

  refresh();
  return { error: retryErrors[outcome] };
}

const retryErrors: Record<RetryOutcome, MessageKey | null> = {
  retried: null,
  retried_unrecorded: "forms.errorRetryUnrecorded",
  gone: "forms.failureRetryGone",
  not_retryable: "forms.errorRetryNotPossible",
};

function writeError(error: PostgrestError): MessageKey {
  if (error.code === INSUFFICIENT_PRIVILEGE) return "forms.errorForbidden";
  console.error("Form could not be saved", error);
  return "forms.errorGeneric";
}

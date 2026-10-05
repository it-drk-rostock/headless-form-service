"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "../auth/profile.ts";
import type { MessageKey } from "../i18n/index.ts";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "../teams/id.ts";
import { isFormId } from "./id.ts";
import { formNameProblem } from "./name.ts";
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
 * Saves a form's name and recipients. The database records recipient
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
  if (!isFormId(id)) return { error: "forms.errorForbidden" };

  await requireProfile();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("forms")
    .update({ name: name.trim(), recipients: parsed.recipients })
    .eq("id", id)
    .select("id");
  if (error) return { error: writeError(error) };
  // RLS hides rows the person may not change, so nothing matched.
  if (data.length === 0) return { error: "forms.errorForbidden" };

  refresh();
  return { error: null, savedAt: Date.now() };
}

function writeError(error: PostgrestError): MessageKey {
  if (error.code === INSUFFICIENT_PRIVILEGE) return "forms.errorForbidden";
  console.error("Form could not be saved", error);
  return "forms.errorGeneric";
}

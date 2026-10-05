"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "../auth/profile.ts";
import type { MessageKey } from "../i18n/index.ts";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "./id.ts";
import { teamNameProblem } from "./name.ts";

/** `savedAt` changes on every successful save, so the form can close itself. */
export type TeamFormState = { error: MessageKey | null; savedAt?: number };

// The database refuses with "insufficient_privilege" when RLS rejects a write.
const INSUFFICIENT_PRIVILEGE = "42501";

/**
 * Creates a team and opens it. Only Super Admins may; the check here gives a
 * clear message, RLS is what enforces it.
 */
export async function createTeam(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const name = String(formData.get("name") ?? "");
  const problem = teamNameProblem(name);
  if (problem) return { error: problem };

  const profile = await requireProfile();
  if (!profile.isSuperAdmin) return { error: "teams.errorForbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .insert({ name: name.trim() })
    .select("id")
    .single();
  if (error) return { error: writeError(error) };

  redirect(`/teams/${data.id}`);
}

/** Renames a team. Only Super Admins may; RLS enforces it. */
export async function renameTeam(
  _previous: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "");
  const problem = teamNameProblem(name);
  if (problem) return { error: problem };

  const profile = await requireProfile();
  if (!profile.isSuperAdmin || !isTeamId(id)) {
    return { error: "teams.errorForbidden" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .update({ name: name.trim() })
    .eq("id", id)
    .select("id");
  if (error) return { error: writeError(error) };
  // RLS hides rows the person may not change, so nothing matched.
  if (data.length === 0) return { error: "teams.errorForbidden" };

  refresh();
  return { error: null, savedAt: Date.now() };
}

function writeError(error: PostgrestError): MessageKey {
  if (error.code === INSUFFICIENT_PRIVILEGE) return "teams.errorForbidden";
  return "teams.errorGeneric";
}

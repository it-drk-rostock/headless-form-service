"use server";

import type { AuthError } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { MessageKey } from "../i18n/index.ts";
import { createClient } from "../supabase/server.ts";
import { newPasswordProblem } from "./password.ts";
import { HOME_PATH, LOGIN_PATH, safeNextPath } from "./routing.ts";

export type FormState = { error: MessageKey | null };

export async function signIn(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "auth.errorMissingFields" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: signInError(error) };

  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

function signInError(error: AuthError): MessageKey {
  // Unknown email and wrong password look the same, so accounts cannot be probed.
  if (error.code === "invalid_credentials")
    return "auth.errorInvalidCredentials";
  if (error.status === 429) return "auth.errorTooManyAttempts";
  return "auth.errorGeneric";
}

export async function setPassword(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const problem = newPasswordProblem(
    password,
    String(formData.get("confirmation") ?? ""),
  );
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: setPasswordError(error) };

  redirect(HOME_PATH);
}

function setPasswordError(error: AuthError): MessageKey {
  if (error.code === "weak_password") return "auth.errorPasswordWeak";
  if (error.code === "same_password") return "auth.errorPasswordSame";
  return "auth.errorSetPassword";
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}

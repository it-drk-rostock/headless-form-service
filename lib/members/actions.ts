"use server";

import type { AuthError, PostgrestError } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "../auth/profile.ts";
import type { MessageKey } from "../i18n/index.ts";
import { normalizeEmail } from "../shared/email.ts";
import { createAdminClient } from "../supabase/admin.ts";
import { createClient } from "../supabase/server.ts";
import { isTeamId } from "../teams/id.ts";
import { isTeamRole } from "../teams/types.ts";
import { emailProblem } from "./email.ts";
import { type InviteOutcome, inviteMember } from "./invite.ts";
import { FULL_NAME_MAX_LENGTH } from "./types.ts";

/**
 * `email` fills the `{email}` placeholder of the message. `outcome` is set on
 * success, so the form can show it or close.
 */
export type MemberFormState = {
  error: MessageKey | null;
  email?: string;
  outcome?: InviteOutcome | "sent" | "saved";
};

// Database errors the dashboard explains to the person.
const INSUFFICIENT_PRIVILEGE = "42501";
const UNIQUE_VIOLATION = "23505";
const LAST_TEAM_ADMIN = "HF001"; // raised by private.keep_last_team_admin()

/** An expected failure with a message for the person. */
class Refusal extends Error {
  constructor(readonly key: MessageKey) {
    super(key);
  }
}

/**
 * The signed-in person's client, if they may manage the team's members: a
 * Super Admin, or a Team Admin of that team. RLS enforces the same rule; this
 * check gives a clear message and keeps the service role from ever acting
 * for someone who may not.
 */
async function requireTeamAdmin(teamId: string) {
  if (!isTeamId(teamId)) throw new Refusal("members.errorForbidden");
  const profile = await requireProfile();
  const supabase = await createClient();
  if (profile.isSuperAdmin) return { profile, supabase };

  const { data, error } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", profile.id)
    .maybeSingle();
  if (error) throw error;
  if (data?.role !== "team_admin") throw new Refusal("members.errorForbidden");
  return { profile, supabase };
}

/**
 * Invites someone into a team by email address: creates the account and
 * sends an invite (IONOS SMTP via Supabase Auth) if needed, otherwise adds
 * the existing account without an email.
 */
export async function inviteMemberAction(
  _previous: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const teamId = String(formData.get("teamId") ?? "");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const fullName = String(formData.get("fullName") ?? "").trim();
  const role = String(formData.get("role") ?? "");

  const problem = emailProblem(email);
  if (problem) return { error: problem };
  if (fullName.length > FULL_NAME_MAX_LENGTH) {
    return { error: "members.errorFullNameTooLong" };
  }
  if (!isTeamRole(role)) return { error: "members.errorGeneric" };

  try {
    const { supabase } = await requireTeamAdmin(teamId);
    const admin = createAdminClient();

    const outcome = await inviteMember(
      { email, fullName, role },
      {
        async findAccount(address) {
          const { data, error } = await admin
            .from("profiles")
            .select("id")
            // Exact match: Supabase Auth stores addresses lower-case, and
            // `address` is normalised. No `ilike`, whose wildcards (`*`, `%`)
            // would let a crafted address match someone else's account.
            .eq("email", address)
            .maybeSingle();
          if (error) throw error;
          return data?.id ?? null;
        },
        async inviteAccount(address, name) {
          const { data, error } = await admin.auth.admin.inviteUserByEmail(
            address,
            { data: name ? { full_name: name } : {} },
          );
          if (error?.code === "email_exists") return { exists: true };
          if (error) throw authRefusal(error);
          return { userId: data.user.id };
        },
        async addMembership(userId, memberRole) {
          // As the signed-in person, so RLS has the final say.
          const { error } = await supabase
            .from("team_members")
            .insert({ team_id: teamId, user_id: userId, role: memberRole });
          if (error?.code === UNIQUE_VIOLATION) return "already_member";
          if (error) throw databaseRefusal(error);
          return "added";
        },
      },
    );

    if (outcome === "already_member") {
      return { error: "members.errorAlreadyMember", email };
    }
    refresh();
    return { error: null, email, outcome };
  } catch (error) {
    return { error: refusalKey(error), email };
  }
}

/** Makes a member Team Admin or plain member. */
export async function changeMemberRole(
  _previous: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isTeamRole(role)) return { error: "members.errorGeneric" };

  try {
    const { supabase } = await requireTeamAdmin(teamId);
    const { data, error } = await supabase
      .from("team_members")
      .update({ role })
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .select("user_id");
    if (error) throw databaseRefusal(error);
    if (data.length === 0) throw new Refusal("members.errorNotMember");
  } catch (error) {
    return { error: refusalKey(error) };
  }

  return saved();
}

/** Removes someone from a team. Their account stays. */
export async function removeMember(
  _previous: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  let leftTeam: boolean;
  try {
    const { profile, supabase } = await requireTeamAdmin(teamId);
    const { data, error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .select("user_id");
    if (error) throw databaseRefusal(error);
    if (data.length === 0) throw new Refusal("members.errorNotMember");
    leftTeam = userId === profile.id && !profile.isSuperAdmin;
  } catch (error) {
    return { error: refusalKey(error) };
  }

  // Someone who removed themselves can no longer see the team.
  if (leftTeam) redirect("/teams");
  return saved();
}

/**
 * Emails a member a link to set a new password (blueprint §2.3: there is no
 * self-service reset). Uses Supabase Auth's recovery email, sent via IONOS.
 */
export async function sendPasswordLink(
  _previous: MemberFormState,
  formData: FormData,
): Promise<MemberFormState> {
  const teamId = String(formData.get("teamId") ?? "");
  const userId = String(formData.get("userId") ?? "");

  let email = "";
  try {
    const { supabase } = await requireTeamAdmin(teamId);
    // Only members of this team, and the address comes from the database.
    const { data, error } = await supabase
      .from("team_members")
      .select("profiles(email)")
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .maybeSingle()
      .overrideTypes<
        { profiles: { email: string } | null },
        { merge: false }
      >();
    if (error) throw error;
    email = data?.profiles?.email ?? "";
    if (!email) throw new Refusal("members.errorNotMember");

    const { error: sendError } =
      await createAdminClient().auth.resetPasswordForEmail(email);
    if (sendError) throw authRefusal(sendError);
  } catch (error) {
    return { error: refusalKey(error), email };
  }

  return { error: null, email, outcome: "sent" };
}

/** Shows the change on the page and lets the form close. */
function saved(): MemberFormState {
  refresh();
  return { error: null, outcome: "saved" };
}

function databaseRefusal(error: PostgrestError): Error {
  if (error.code === LAST_TEAM_ADMIN) {
    return new Refusal("members.errorLastTeamAdmin");
  }
  if (error.code === INSUFFICIENT_PRIVILEGE) {
    return new Refusal("members.errorForbidden");
  }
  return new Error(error.message);
}

function authRefusal(error: AuthError): Error {
  if (error.status === 429 || error.code === "over_email_send_rate_limit") {
    return new Refusal("members.errorTooManyEmails");
  }
  return error;
}

function refusalKey(error: unknown): MessageKey {
  if (error instanceof Refusal) return error.key;
  console.error("Membership action failed", error);
  return "members.errorGeneric";
}

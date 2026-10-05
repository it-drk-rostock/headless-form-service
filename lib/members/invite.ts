import type { TeamRole } from "../teams/types.ts";

/**
 * What inviting needs from the outside world. The dashboard wires these to
 * Supabase (`lib/members/actions.ts`); tests use in-memory fakes.
 */
export type InviteDependencies = {
  /** The account's user ID, or null when nobody has this address yet. */
  findAccount(email: string): Promise<string | null>;
  /**
   * Creates the account and sends the invite email. `exists` when the
   * address got an account in the meantime.
   */
  inviteAccount(
    email: string,
    fullName: string,
  ): Promise<{ userId: string } | { exists: true }>;
  addMembership(
    userId: string,
    role: TeamRole,
  ): Promise<"added" | "already_member">;
};

/**
 * `invited`: a new account was created and sent an invite.
 * `added`: an existing account joined the team; no email is sent.
 * `already_member`: nothing changed.
 */
export type InviteOutcome = "invited" | "added" | "already_member";

/**
 * Brings a person into a team by email address (blueprint §2.3): creates the
 * account and sends an invite if needed, otherwise simply adds the account.
 * `email` must already be normalised (`normalizeEmail`).
 */
export async function inviteMember(
  input: { email: string; fullName: string; role: TeamRole },
  deps: InviteDependencies,
): Promise<InviteOutcome> {
  let userId = await deps.findAccount(input.email);
  let invited = false;

  if (!userId) {
    const result = await deps.inviteAccount(input.email, input.fullName);
    if ("userId" in result) {
      userId = result.userId;
      invited = true;
    } else {
      userId = await deps.findAccount(input.email);
      if (!userId) {
        throw new Error("The account exists but could not be found by email");
      }
    }
  }

  const membership = await deps.addMembership(userId, input.role);
  if (membership === "already_member") return "already_member";
  return invited ? "invited" : "added";
}

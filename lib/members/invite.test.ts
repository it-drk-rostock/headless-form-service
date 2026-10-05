import { describe, expect, it } from "vitest";
import { type InviteDependencies, inviteMember } from "./invite.ts";

/** An in-memory auth system and team, recording the invites it sends. */
function fakes({
  accounts = {} as Record<string, string>,
  members = [] as string[],
  createdElsewhere = false,
} = {}) {
  const invitesSent: { email: string; fullName: string }[] = [];
  const added: { userId: string; role: string }[] = [];
  const deps: InviteDependencies = {
    async findAccount(email) {
      return accounts[email] ?? null;
    },
    async inviteAccount(email, fullName) {
      if (createdElsewhere) {
        // Someone else invited the same address a moment earlier.
        accounts[email] = "raced-id";
        return { exists: true };
      }
      invitesSent.push({ email, fullName });
      accounts[email] = `new-${email}`;
      return { userId: accounts[email] };
    },
    async addMembership(userId, role) {
      if (members.includes(userId)) return "already_member";
      members.push(userId);
      added.push({ userId, role });
      return "added";
    },
  };
  return { deps, invitesSent, added };
}

describe("inviteMember", () => {
  it("creates an account for a new address, sends the invite and adds them", async () => {
    const { deps, invitesSent, added } = fakes();

    const outcome = await inviteMember(
      { email: "lea@drk-rostock.de", fullName: "Lea Kurz", role: "member" },
      deps,
    );

    expect(outcome).toBe("invited");
    expect(invitesSent).toEqual([
      { email: "lea@drk-rostock.de", fullName: "Lea Kurz" },
    ]);
    expect(added).toEqual([
      { userId: "new-lea@drk-rostock.de", role: "member" },
    ]);
  });

  it("simply adds an existing account, without sending an email", async () => {
    const { deps, invitesSent, added } = fakes({
      accounts: { "max@drk-rostock.de": "max-id" },
    });

    const outcome = await inviteMember(
      { email: "max@drk-rostock.de", fullName: "", role: "team_admin" },
      deps,
    );

    expect(outcome).toBe("added");
    expect(invitesSent).toEqual([]);
    expect(added).toEqual([{ userId: "max-id", role: "team_admin" }]);
  });

  it("reports someone who is already in the team", async () => {
    const { deps, invitesSent } = fakes({
      accounts: { "max@drk-rostock.de": "max-id" },
      members: ["max-id"],
    });

    const outcome = await inviteMember(
      { email: "max@drk-rostock.de", fullName: "", role: "member" },
      deps,
    );

    expect(outcome).toBe("already_member");
    expect(invitesSent).toEqual([]);
  });

  it("adds the account when it was created by a concurrent invite", async () => {
    const { deps, invitesSent, added } = fakes({ createdElsewhere: true });

    const outcome = await inviteMember(
      { email: "lea@drk-rostock.de", fullName: "", role: "member" },
      deps,
    );

    expect(outcome).toBe("added");
    expect(invitesSent).toEqual([]);
    expect(added).toEqual([{ userId: "raced-id", role: "member" }]);
  });
});

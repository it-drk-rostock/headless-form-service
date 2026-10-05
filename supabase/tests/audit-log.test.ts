import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addTeamMember,
  commitAs,
  createAuthUser,
  createSuperAdmin,
  createTeam,
  migratedDatabase,
  queryAs,
} from "./database.ts";

let db: PGlite;
let firstAid: string;
let bloodDrive: string;
let root: string; // Super Admin, in no team
let anna: string; // Team Admin of Erste Hilfe
let max: string; // member of Erste Hilfe
let bea: string; // Team Admin of Blutspende
let eve: string; // no team yet

beforeEach(async () => {
  db = await migratedDatabase();
  firstAid = await createTeam(db, "Erste Hilfe");
  bloodDrive = await createTeam(db, "Blutspende");
  root = await createSuperAdmin(db, "root@drk-rostock.de");
  anna = await createAuthUser(db, "anna@drk-rostock.de");
  max = await createAuthUser(db, "max@drk-rostock.de");
  bea = await createAuthUser(db, "bea@drk-rostock.de");
  eve = await createAuthUser(db, "eve@drk-rostock.de");
  await addTeamMember(db, firstAid, anna, "team_admin");
  await addTeamMember(db, firstAid, max, "member");
  await addTeamMember(db, bloodDrive, bea, "team_admin");
  // The setup above ran without a signed-in person; start from an empty log.
  await db.exec("alter table public.audit_log disable trigger user");
  await db.exec("delete from public.audit_log");
  await db.exec("alter table public.audit_log enable trigger user");
});

type Entry = {
  team_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
};

async function entries(): Promise<Entry[]> {
  const { rows } = await db.query<Entry>(
    `select team_id, actor_id, actor_email, action, entity_type, entity_id, details
     from public.audit_log order by id`,
  );
  return rows;
}

describe("membership changes are recorded", () => {
  it("records an invite with who added whom, as which role", async () => {
    await commitAs(
      db,
      { userId: anna },
      "insert into public.team_members (team_id, user_id, role) values ($1, $2, 'member')",
      [firstAid, eve],
    );
    expect(await entries()).toEqual([
      {
        team_id: firstAid,
        actor_id: anna,
        actor_email: "anna@drk-rostock.de",
        action: "member.added",
        entity_type: "member",
        entity_id: eve,
        details: { email: "eve@drk-rostock.de", role: "member" },
      },
    ]);
  });

  it("records a role change with the old and new role", async () => {
    await commitAs(
      db,
      { userId: anna },
      "update public.team_members set role = 'team_admin' where team_id = $1 and user_id = $2",
      [firstAid, max],
    );
    expect(await entries()).toEqual([
      expect.objectContaining({
        team_id: firstAid,
        actor_id: anna,
        action: "member.role_changed",
        entity_id: max,
        details: {
          email: "max@drk-rostock.de",
          from: "member",
          to: "team_admin",
        },
      }),
    ]);
  });

  it("does not record an update that leaves the role as it was", async () => {
    await commitAs(
      db,
      { userId: anna },
      "update public.team_members set role = 'member' where team_id = $1 and user_id = $2",
      [firstAid, max],
    );
    expect(await entries()).toEqual([]);
  });

  it("records a removal", async () => {
    await commitAs(
      db,
      { userId: root },
      "delete from public.team_members where team_id = $1 and user_id = $2",
      [firstAid, max],
    );
    expect(await entries()).toEqual([
      expect.objectContaining({
        team_id: firstAid,
        actor_id: root,
        actor_email: "root@drk-rostock.de",
        action: "member.removed",
        entity_id: max,
        details: { email: "max@drk-rostock.de", role: "member" },
      }),
    ]);
  });

  it("records changes without a signed-in person with no actor", async () => {
    await commitAs(
      db,
      "service",
      "delete from public.team_members where team_id = $1 and user_id = $2",
      [firstAid, max],
    );
    expect(await entries()).toEqual([
      expect.objectContaining({
        actor_id: null,
        actor_email: null,
        action: "member.removed",
      }),
    ]);
  });

  it("records nothing when the change is refused", async () => {
    await expect(
      commitAs(
        db,
        { userId: anna },
        "delete from public.team_members where team_id = $1 and user_id = $2",
        [firstAid, anna],
      ),
    ).rejects.toThrow(/last Team Admin/);
    expect(await entries()).toEqual([]);
  });
});

describe("reading the log", () => {
  beforeEach(async () => {
    await commitAs(
      db,
      { userId: anna },
      "insert into public.team_members (team_id, user_id) values ($1, $2)",
      [firstAid, eve],
    );
    await commitAs(
      db,
      { userId: bea },
      "insert into public.team_members (team_id, user_id) values ($1, $2)",
      [bloodDrive, eve],
    );
  });

  const READ = "select team_id from public.audit_log";

  it("shows Team Admins their own team's entries only", async () => {
    expect(await queryAs(db, { userId: anna }, READ)).toEqual([
      { team_id: firstAid },
    ]);
  });

  it("shows Super Admins every entry", async () => {
    expect(await queryAs(db, { userId: root }, READ)).toHaveLength(2);
  });

  it("shows Team Members nothing, not even of their own team", async () => {
    expect(await queryAs(db, { userId: max }, READ)).toEqual([]);
    expect(await queryAs(db, { userId: eve }, READ)).toEqual([]);
  });

  it("is closed to visitors", async () => {
    await expect(queryAs(db, "anon", READ)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("entries cannot be written through the Data API", () => {
  beforeEach(async () => {
    await commitAs(
      db,
      { userId: anna },
      "insert into public.team_members (team_id, user_id) values ($1, $2)",
      [firstAid, eve],
    );
  });

  for (const who of ["anna", "root"] as const) {
    it(`refuses ${who} to add, edit or delete entries`, async () => {
      const person = { userId: who === "anna" ? anna : root };
      await expect(
        queryAs(
          db,
          person,
          "insert into public.audit_log (team_id, action, entity_type) values ($1, 'x', 'y')",
          [firstAid],
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        queryAs(db, person, "update public.audit_log set action = 'x'"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        queryAs(db, person, "delete from public.audit_log"),
      ).rejects.toThrow(/permission denied/);
    });
  }

  it("refuses the helper to signed-in people", async () => {
    await expect(
      queryAs(
        db,
        { userId: root },
        "select private.record_audit($1, 'x', 'y', null, '{}')",
        [firstAid],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps entries even from the service role", async () => {
    await expect(
      commitAs(db, "service", "update public.audit_log set action = 'x'"),
    ).rejects.toThrow(/permission denied|append-only/);
    await expect(
      commitAs(db, "service", "delete from public.audit_log"),
    ).rejects.toThrow(/permission denied|append-only/);
    expect(await entries()).toHaveLength(1);
  });

  it("keeps entries when the table owner tries to change them", async () => {
    await expect(
      db.query("update public.audit_log set action = 'x'"),
    ).rejects.toThrow(/append-only/);
    await expect(db.query("delete from public.audit_log")).rejects.toThrow(
      /append-only/,
    );
  });

  it("keeps a team's entries after the team is deleted", async () => {
    await db.query("delete from public.teams where id = $1", [firstAid]);
    expect(
      (await entries()).filter((entry) => entry.team_id === firstAid).length,
    ).toBeGreaterThan(0);
  });
});

describe("the helper", () => {
  it("only accepts a JSON object as details", async () => {
    await expect(
      db.query("select private.record_audit($1, 'x.y', 'x', null, '[1]')", [
        firstAid,
      ]),
    ).rejects.toThrow(/audit_log_details_object/);
  });
});

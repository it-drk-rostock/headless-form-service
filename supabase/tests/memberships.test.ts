import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addTeamMember,
  createAuthUser,
  createSuperAdmin,
  createTeam,
  migratedDatabase,
  queryAs,
} from "./database.ts";

let db: PGlite;
let firstAid: string;
let bloodDrive: string;
let anna: string; // Team Admin of Erste Hilfe
let max: string; // member of Erste Hilfe
let eve: string; // no team yet

beforeEach(async () => {
  db = await migratedDatabase();
  firstAid = await createTeam(db, "Erste Hilfe");
  bloodDrive = await createTeam(db, "Blutspende");
  anna = await createAuthUser(db, "anna@drk-rostock.de");
  max = await createAuthUser(db, "max@drk-rostock.de");
  eve = await createAuthUser(db, "eve@drk-rostock.de");
  await addTeamMember(db, firstAid, anna, "team_admin");
  await addTeamMember(db, firstAid, max, "member");
});

const ADD =
  "insert into public.team_members (team_id, user_id, role) values ($1, $2, $3) returning role";
const CHANGE_ROLE =
  "update public.team_members set role = $3 where team_id = $1 and user_id = $2 returning role";
const REMOVE =
  "delete from public.team_members where team_id = $1 and user_id = $2 returning user_id";

describe("a Team Admin", () => {
  it("adds people to their own team", async () => {
    const rows = await queryAs(db, { userId: anna }, ADD, [
      firstAid,
      eve,
      "member",
    ]);
    expect(rows).toEqual([{ role: "member" }]);
  });

  it("cannot add people to another team", async () => {
    await expect(
      queryAs(db, { userId: anna }, ADD, [bloodDrive, eve, "member"]),
    ).rejects.toThrow(/row-level security/);
  });

  it("changes roles in their own team", async () => {
    const rows = await queryAs(db, { userId: anna }, CHANGE_ROLE, [
      firstAid,
      max,
      "team_admin",
    ]);
    expect(rows).toEqual([{ role: "team_admin" }]);
  });

  it("removes members of their own team", async () => {
    const rows = await queryAs(db, { userId: anna }, REMOVE, [firstAid, max]);
    expect(rows).toEqual([{ user_id: max }]);
  });

  it("cannot change or remove members of another team", async () => {
    await addTeamMember(db, bloodDrive, eve, "member");
    expect(
      await queryAs(db, { userId: anna }, CHANGE_ROLE, [
        bloodDrive,
        eve,
        "team_admin",
      ]),
    ).toEqual([]);
    expect(
      await queryAs(db, { userId: anna }, REMOVE, [bloodDrive, eve]),
    ).toEqual([]);
  });

  it("cannot move a membership to another team", async () => {
    await expect(
      queryAs(
        db,
        { userId: anna },
        "update public.team_members set team_id = $1 where user_id = $2",
        [bloodDrive, max],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("a Team Member", () => {
  it("cannot add, promote or remove anyone", async () => {
    await expect(
      queryAs(db, { userId: max }, ADD, [firstAid, eve, "member"]),
    ).rejects.toThrow(/row-level security/);
    expect(
      await queryAs(db, { userId: max }, CHANGE_ROLE, [
        firstAid,
        max,
        "team_admin",
      ]),
    ).toEqual([]);
    expect(
      await queryAs(db, { userId: max }, REMOVE, [firstAid, anna]),
    ).toEqual([]);
  });

  it("sees the names and email addresses of their team's members", async () => {
    await addTeamMember(db, bloodDrive, eve, "member");
    const rows = await queryAs<{ email: string }>(
      db,
      { userId: max },
      "select email from public.profiles order by email",
    );
    expect(rows.map((r) => r.email)).toEqual([
      "anna@drk-rostock.de",
      "max@drk-rostock.de",
    ]);
  });
});

describe("a Super Admin", () => {
  it("manages members of any team without belonging to it", async () => {
    const admin = await createSuperAdmin(db, "admin@drk-rostock.de");
    expect(
      await queryAs(db, { userId: admin }, ADD, [
        bloodDrive,
        eve,
        "team_admin",
      ]),
    ).toEqual([{ role: "team_admin" }]);
    expect(
      await queryAs(db, { userId: admin }, CHANGE_ROLE, [
        firstAid,
        max,
        "team_admin",
      ]),
    ).toEqual([{ role: "team_admin" }]);
    expect(
      await queryAs(db, { userId: admin }, REMOVE, [firstAid, max]),
    ).toEqual([{ user_id: max }]);
  });
});

describe("the anon role", () => {
  it("cannot write memberships", async () => {
    await expect(
      queryAs(db, "anon", ADD, [firstAid, eve, "member"]),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("the last Team Admin", () => {
  it("cannot be demoted by a Team Admin", async () => {
    await expect(
      queryAs(db, { userId: anna }, CHANGE_ROLE, [firstAid, anna, "member"]),
    ).rejects.toThrow(/last Team Admin/);
  });

  it("cannot be removed by a Team Admin", async () => {
    await expect(
      queryAs(db, { userId: anna }, REMOVE, [firstAid, anna]),
    ).rejects.toThrow(/last Team Admin/);
  });

  it("can step down once another Team Admin exists", async () => {
    await addTeamMember(db, firstAid, eve, "team_admin");
    expect(
      await queryAs(db, { userId: anna }, CHANGE_ROLE, [
        firstAid,
        anna,
        "member",
      ]),
    ).toEqual([{ role: "member" }]);
    expect(
      await queryAs(db, { userId: anna }, REMOVE, [firstAid, anna]),
    ).toEqual([{ user_id: anna }]);
  });

  it("cannot be lost by removing every Team Admin at once", async () => {
    await addTeamMember(db, firstAid, eve, "team_admin");
    await expect(
      queryAs(
        db,
        { userId: anna },
        "delete from public.team_members where team_id = $1 and role = 'team_admin'",
        [firstAid],
      ),
    ).rejects.toThrow(/last Team Admin/);
  });

  it("can be demoted or removed by a Super Admin", async () => {
    const admin = await createSuperAdmin(db, "admin@drk-rostock.de");
    expect(
      await queryAs(db, { userId: admin }, CHANGE_ROLE, [
        firstAid,
        anna,
        "member",
      ]),
    ).toEqual([{ role: "member" }]);
    expect(
      await queryAs(db, { userId: admin }, REMOVE, [firstAid, anna]),
    ).toEqual([{ user_id: anna }]);
  });

  it("does not keep a deleted team or account alive", async () => {
    await db.query("delete from auth.users where id = $1", [anna]);
    expect(
      (
        await db.query("select 1 from public.team_members where user_id = $1", [
          anna,
        ])
      ).rows,
    ).toEqual([]);

    await addTeamMember(db, firstAid, eve, "team_admin");
    await db.query("delete from public.teams where id = $1", [firstAid]);
    expect(
      (
        await db.query("select 1 from public.team_members where team_id = $1", [
          firstAid,
        ])
      ).rows,
    ).toEqual([]);
  });

  it("does not stop a Team Admin from managing other members", async () => {
    expect(
      await queryAs(db, { userId: anna }, REMOVE, [firstAid, max]),
    ).toEqual([{ user_id: max }]);
  });
});

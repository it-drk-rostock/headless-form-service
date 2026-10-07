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
let root: string; // Super Admin, in no team
let anna: string; // Team Admin of Erste Hilfe
let max: string; // member of Erste Hilfe
let bea: string; // member of Blutspende
let form: string; // Erste Hilfe's form

const QUESTIONS = {
  pages: [{ name: "p1", elements: [{ type: "text", name: "vorname" }] }],
};
const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";

const ARCHIVE = "select public.archive_form($1)";
const UNARCHIVE = "select public.unarchive_form($1)";
const DELETE = "select public.delete_form($1)";

beforeEach(async () => {
  db = await migratedDatabase();
  firstAid = await createTeam(db, "Erste Hilfe");
  const bloodDrive = await createTeam(db, "Blutspende");
  root = await createSuperAdmin(db, "root@drk-rostock.de");
  anna = await createAuthUser(db, "anna@drk-rostock.de");
  max = await createAuthUser(db, "max@drk-rostock.de");
  bea = await createAuthUser(db, "bea@drk-rostock.de");
  await addTeamMember(db, firstAid, anna, "team_admin");
  await addTeamMember(db, firstAid, max, "member");
  await addTeamMember(db, bloodDrive, bea, "member");
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name, draft_schema) values ($1, 'Kursanmeldung', $2) returning id",
    [firstAid, QUESTIONS],
  );
  form = rows[0].id;
});

async function archivedAt(): Promise<string | null> {
  const { rows } = await db.query<{ archived_at: string | null }>(
    "select archived_at from public.forms where id = $1",
    [form],
  );
  return rows[0].archived_at;
}

async function formEntries() {
  const { rows } = await db.query<{
    team_id: string;
    actor_id: string | null;
    action: string;
    entity_id: string;
    details: Record<string, unknown>;
  }>(
    `select team_id, actor_id, action, entity_id, details from public.audit_log
     where action in ('form.archived', 'form.unarchived', 'form.deleted') order by id`,
  );
  return rows;
}

async function publishAndUse(): Promise<void> {
  await commitAs(db, { userId: max }, "select public.publish_form($1)", [form]);
  await commitAs(db, "service", "select public.count_form_load($1)", [form]);
  await commitAs(db, "service", "select public.queue_submission($1, $2, 1)", [
    SUBMISSION,
    form,
  ]);
}

describe("archiving", () => {
  it("can be done by members of the owning team, and undone", async () => {
    await commitAs(db, { userId: max }, ARCHIVE, [form]);
    expect(await archivedAt()).not.toBeNull();

    await commitAs(db, { userId: max }, UNARCHIVE, [form]);
    expect(await archivedAt()).toBeNull();
  });

  it("can be done by a Super Admin for any team", async () => {
    await commitAs(db, { userId: root }, ARCHIVE, [form]);
    expect(await archivedAt()).not.toBeNull();
  });

  it("is refused to members of other teams", async () => {
    await expect(queryAs(db, { userId: bea }, ARCHIVE, [form])).rejects.toThrow(
      /only the form's team members and Super Admins/,
    );
    await commitAs(db, { userId: max }, ARCHIVE, [form]);
    await expect(
      queryAs(db, { userId: bea }, UNARCHIVE, [form]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("is refused to visitors", async () => {
    await expect(queryAs(db, "anon", ARCHIVE, [form])).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("keeps the first archiving time when archived again", async () => {
    await commitAs(db, { userId: max }, ARCHIVE, [form]);
    const first = await archivedAt();
    await commitAs(db, { userId: anna }, ARCHIVE, [form]);
    expect(await archivedAt()).toEqual(first);
  });

  it("cannot be set directly, only through archive_form", async () => {
    await expect(
      queryAs(
        db,
        { userId: max },
        "update public.forms set archived_at = now() where id = $1",
        [form],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("keeps the versions and statistics, and stops loads and submissions", async () => {
    await publishAndUse();
    await commitAs(db, { userId: max }, ARCHIVE, [form]);

    expect(
      await commitAs(db, "service", "select * from public.load_form($1)", [
        form,
      ]),
    ).toEqual([]);
    expect(
      await commitAs(
        db,
        "service",
        "select * from public.submission_form($1, 1)",
        [form],
      ),
    ).toEqual([]);
    const { rows } = await db.query(
      `select (select count(*)::int from public.form_versions where form_id = $1) as versions,
              (select count(*)::int from public.form_stats where form_id = $1) as submissions,
              (select count(*)::int from public.form_load_counts where form_id = $1) as load_days`,
      [form],
    );
    expect(rows).toEqual([{ versions: 1, submissions: 1, load_days: 1 }]);
  });

  it("serves the form again once unarchived", async () => {
    await publishAndUse();
    await commitAs(db, { userId: max }, ARCHIVE, [form]);
    await commitAs(db, { userId: max }, UNARCHIVE, [form]);

    expect(
      await commitAs(
        db,
        "service",
        "select version from public.load_form($1)",
        [form],
      ),
    ).toEqual([{ version: 1 }]);
  });

  it("is recorded in the audit log, once per change", async () => {
    await commitAs(db, { userId: max }, ARCHIVE, [form]);
    await commitAs(db, { userId: max }, ARCHIVE, [form]);
    await commitAs(db, { userId: anna }, UNARCHIVE, [form]);
    await commitAs(db, { userId: anna }, UNARCHIVE, [form]);

    expect(await formEntries()).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "form.archived",
        entity_id: form,
        details: { name: "Kursanmeldung" },
      },
      {
        team_id: firstAid,
        actor_id: anna,
        action: "form.unarchived",
        entity_id: form,
        details: { name: "Kursanmeldung" },
      },
    ]);
  });

  it("is in the log the team's Team Admins read", async () => {
    await commitAs(db, { userId: max }, ARCHIVE, [form]);
    expect(
      await queryAs(
        db,
        { userId: anna },
        "select action from public.audit_log where action = 'form.archived'",
      ),
    ).toEqual([{ action: "form.archived" }]);
  });
});

describe("hard delete", () => {
  it("removes the form with its versions, statistics and load counts, for a Super Admin", async () => {
    await publishAndUse();
    await commitAs(db, { userId: root }, DELETE, [form]);

    const { rows } = await db.query(
      `select (select count(*)::int from public.forms where id = $1) as forms,
              (select count(*)::int from public.form_versions where form_id = $1) as versions,
              (select count(*)::int from public.form_stats where form_id = $1) as submissions,
              (select count(*)::int from public.form_load_counts where form_id = $1) as load_days`,
      [form],
    );
    expect(rows).toEqual([
      { forms: 0, versions: 0, submissions: 0, load_days: 0 },
    ]);
  });

  it("works for archived forms too", async () => {
    await commitAs(db, { userId: max }, ARCHIVE, [form]);
    await commitAs(db, { userId: root }, DELETE, [form]);
    expect(await formEntries()).toEqual([
      expect.objectContaining({ action: "form.archived" }),
      expect.objectContaining({ action: "form.deleted" }),
    ]);
  });

  it.each([
    ["the team's Team Admin", () => anna],
    ["a member of the team", () => max],
    ["a member of another team", () => bea],
  ])("is refused to %s", async (_who, who) => {
    await expect(
      queryAs(db, { userId: who() }, DELETE, [form]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("is refused to visitors", async () => {
    await expect(queryAs(db, "anon", DELETE, [form])).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("is still not possible through the Data API, even for a Super Admin", async () => {
    await expect(
      queryAs(db, { userId: root }, "delete from public.forms"),
    ).rejects.toThrow(/permission denied/);
  });

  it("reports a form that does not exist", async () => {
    await expect(
      queryAs(db, { userId: root }, DELETE, [
        "00000000-0000-4000-8000-000000000000",
      ]),
    ).rejects.toMatchObject({ code: "HF009" });
  });

  it("is recorded in the audit log, which outlives the form and stays readable by the team's Team Admins", async () => {
    await publishAndUse();
    await commitAs(db, { userId: root }, DELETE, [form]);

    expect(await formEntries()).toEqual([
      {
        team_id: firstAid,
        actor_id: root,
        action: "form.deleted",
        entity_id: form,
        details: { name: "Kursanmeldung" },
      },
    ]);
    expect(
      await queryAs(
        db,
        { userId: anna },
        "select action from public.audit_log where action = 'form.deleted'",
      ),
    ).toEqual([{ action: "form.deleted" }]);
  });
});

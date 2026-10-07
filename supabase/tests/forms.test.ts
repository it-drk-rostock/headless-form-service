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
let bea: string; // member of Blutspende

beforeEach(async () => {
  db = await migratedDatabase();
  firstAid = await createTeam(db, "Erste Hilfe");
  bloodDrive = await createTeam(db, "Blutspende");
  root = await createSuperAdmin(db, "root@drk-rostock.de");
  anna = await createAuthUser(db, "anna@drk-rostock.de");
  max = await createAuthUser(db, "max@drk-rostock.de");
  bea = await createAuthUser(db, "bea@drk-rostock.de");
  await addTeamMember(db, firstAid, anna, "team_admin");
  await addTeamMember(db, firstAid, max, "member");
  await addTeamMember(db, bloodDrive, bea, "member");
});

async function createForm(teamId: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name) values ($1, $2) returning id",
    [teamId, name],
  );
  return rows[0].id;
}

describe("a new form", () => {
  it("can be created by any member of the owning team", async () => {
    const rows = await queryAs(
      db,
      { userId: max },
      "insert into public.forms (team_id, name) values ($1, 'Kursanmeldung') returning name",
      [firstAid],
    );
    expect(rows).toEqual([{ name: "Kursanmeldung" }]);
  });

  it("can be created by a Super Admin for any team", async () => {
    const rows = await queryAs(
      db,
      { userId: root },
      "insert into public.forms (team_id, name) values ($1, 'Spenderumfrage') returning name",
      [bloodDrive],
    );
    expect(rows).toEqual([{ name: "Spenderumfrage" }]);
  });

  it("cannot be created for a team the person is not in", async () => {
    await expect(
      queryAs(
        db,
        { userId: max },
        "insert into public.forms (team_id, name) values ($1, 'Fremd')",
        [bloodDrive],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("starts as an open, public, unpublished draft without recipients, with the default email template", async () => {
    const id = await createForm(firstAid, "Kursanmeldung");
    const { rows } = await db.query(
      `select access_type, is_closed, archived_at, recipients::text[], current_version,
              turnstile_enabled, draft_schema, draft_email_template
       from public.forms where id = $1`,
      [id],
    );
    expect(rows).toEqual([
      {
        access_type: "public",
        is_closed: false,
        archived_at: null,
        recipients: [],
        current_version: null,
        turnstile_enabled: true,
        draft_schema: {},
        draft_email_template: expect.objectContaining({ mode: "standard" }),
      },
    ]);
  });

  it("cannot set what only publishing, closing or archiving may set", async () => {
    await expect(
      queryAs(
        db,
        { userId: max },
        "insert into public.forms (team_id, name, current_version) values ($1, 'X', 3)",
        [firstAid],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("gets its recipients afterwards, so every list is audited as a change", async () => {
    await expect(
      queryAs(
        db,
        { userId: max },
        "insert into public.forms (team_id, name, recipients) values ($1, 'X', '{a@drk-rostock.de}')",
        [firstAid],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("needs a name that is not blank", async () => {
    await expect(createForm(firstAid, "  ")).rejects.toThrow(
      /forms_name_check/,
    );
  });
});

describe("forms are visible", () => {
  beforeEach(async () => {
    await createForm(firstAid, "Kursanmeldung");
    await createForm(bloodDrive, "Spenderumfrage");
  });

  const READ = "select name from public.forms order by name";

  it("to the members of the owning team only", async () => {
    expect(await queryAs(db, { userId: max }, READ)).toEqual([
      { name: "Kursanmeldung" },
    ]);
    expect(await queryAs(db, { userId: bea }, READ)).toEqual([
      { name: "Spenderumfrage" },
    ]);
  });

  it("all to a Super Admin", async () => {
    expect(await queryAs(db, { userId: root }, READ)).toHaveLength(2);
  });

  it("never to visitors", async () => {
    await expect(queryAs(db, "anon", READ)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("form settings", () => {
  let form: string;

  beforeEach(async () => {
    form = await createForm(firstAid, "Kursanmeldung");
  });

  it("can be changed by members of the owning team", async () => {
    const rows = await queryAs(
      db,
      { userId: max },
      `update public.forms set name = 'Kurse', recipients = '{kurse@drk-rostock.de}'
       where id = $1 returning name, recipients::text[]`,
      [form],
    );
    expect(rows).toEqual([
      { name: "Kurse", recipients: ["kurse@drk-rostock.de"] },
    ]);
  });

  it("can switch Turnstile off and on, for members of the owning team", async () => {
    const rows = await queryAs(
      db,
      { userId: max },
      "update public.forms set turnstile_enabled = false where id = $1 returning turnstile_enabled",
      [form],
    );
    expect(rows).toEqual([{ turnstile_enabled: false }]);
  });

  it("can be closed by members of the owning team", async () => {
    const rows = await queryAs(
      db,
      { userId: max },
      "update public.forms set is_closed = true where id = $1 returning is_closed",
      [form],
    );
    expect(rows).toEqual([{ is_closed: true }]);
  });

  it("cannot be closed by members of other teams", async () => {
    const rows = await queryAs(
      db,
      { userId: bea },
      "update public.forms set is_closed = true where id = $1 returning id",
      [form],
    );
    expect(rows).toEqual([]);
  });

  it("can set the Reply-To question and sender name, for members of the owning team", async () => {
    const rows = await queryAs(
      db,
      { userId: max },
      `update public.forms set reply_to_question = 'email', sender_display_name = 'DRK Kurse'
       where id = $1 returning reply_to_question, sender_display_name`,
      [form],
    );
    expect(rows).toEqual([
      { reply_to_question: "email", sender_display_name: "DRK Kurse" },
    ]);
  });

  it("cannot be changed by members of other teams", async () => {
    const rows = await queryAs(
      db,
      { userId: bea },
      "update public.forms set name = 'Gekapert' where id = $1 returning id",
      [form],
    );
    expect(rows).toEqual([]);
  });

  it("cannot move a form to another team", async () => {
    await expect(
      queryAs(db, { userId: root }, "update public.forms set team_id = $1", [
        bloodDrive,
      ]),
    ).rejects.toThrow(/permission denied/);
  });

  it("cannot delete a form", async () => {
    await expect(
      queryAs(db, { userId: anna }, "delete from public.forms"),
    ).rejects.toThrow(/permission denied/);
  });

  it("accept only email addresses as recipients", async () => {
    for (const recipients of [
      "{kurse}",
      "{kurse@drk-rostock}",
      '{"kurse @drk-rostock.de"}',
      '{"a@drk-rostock.de,b@drk-rostock.de"}',
      "{NULL}",
      "{Kurse@DRK-Rostock.de}",
    ]) {
      await expect(
        db.query("update public.forms set recipients = $1 where id = $2", [
          recipients,
          form,
        ]),
      ).rejects.toThrow(/email_address_check|forms_recipients_check/);
    }
  });

  it("refuse an empty Reply-To question, which is null instead", async () => {
    await expect(
      db.query("update public.forms set reply_to_question = '' where id = $1", [
        form,
      ]),
    ).rejects.toThrow(/forms_reply_to_question_check/);
  });

  it("keep the sender name on one line", async () => {
    for (const name of ["DRK\nKurse", "DRK\r\nBcc: x@y.de", "DRK\tKurse"]) {
      await expect(
        db.query(
          "update public.forms set sender_display_name = $1 where id = $2",
          [name, form],
        ),
      ).rejects.toThrow(/forms_sender_display_name_line_check/);
    }
  });

  it("accept at most 20 recipients", async () => {
    const many = Array.from({ length: 21 }, (_, i) => `r${i}@drk-rostock.de`);
    await expect(
      db.query(
        "update public.forms set recipients = $1::text[] where id = $2",
        [many, form],
      ),
    ).rejects.toThrow(/forms_recipients_check/);
  });
});

describe("the audit log", () => {
  type Entry = {
    team_id: string;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    details: Record<string, unknown>;
  };

  async function formEntries(): Promise<Entry[]> {
    const { rows } = await db.query<Entry>(
      `select team_id, actor_id, action, entity_type, entity_id, details
       from public.audit_log where entity_type = 'form' order by id`,
    );
    return rows;
  }

  it("records who created a form", async () => {
    const [{ id }] = await commitAs<{ id: string }>(
      db,
      { userId: max },
      "insert into public.forms (team_id, name) values ($1, 'Kursanmeldung') returning id",
      [firstAid],
    );
    expect(await formEntries()).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "form.created",
        entity_type: "form",
        entity_id: id,
        details: { name: "Kursanmeldung" },
      },
    ]);
  });

  it("records recipient changes with the old and new list", async () => {
    const form = await createForm(firstAid, "Kursanmeldung");
    await db.query(
      "update public.forms set recipients = '{alt@drk-rostock.de}' where id = $1",
      [form],
    );
    await commitAs(
      db,
      { userId: max },
      "update public.forms set recipients = '{neu@drk-rostock.de,kurse@drk-rostock.de}' where id = $1",
      [form],
    );
    expect((await formEntries()).at(-1)).toEqual({
      team_id: firstAid,
      actor_id: max,
      action: "form.recipients_changed",
      entity_type: "form",
      entity_id: form,
      details: {
        name: "Kursanmeldung",
        from: ["alt@drk-rostock.de"],
        to: ["neu@drk-rostock.de", "kurse@drk-rostock.de"],
      },
    });
  });

  it("records a rename with the old and new name", async () => {
    const form = await createForm(firstAid, "Kursanmeldung");
    await commitAs(
      db,
      { userId: anna },
      "update public.forms set name = 'Kurse' where id = $1",
      [form],
    );
    expect((await formEntries()).at(-1)).toEqual(
      expect.objectContaining({
        action: "form.renamed",
        actor_id: anna,
        details: { from: "Kursanmeldung", to: "Kurse" },
      }),
    );
  });

  it("records switching Turnstile off and on", async () => {
    const form = await createForm(firstAid, "Kursanmeldung");
    await commitAs(
      db,
      { userId: max },
      "update public.forms set turnstile_enabled = false where id = $1",
      [form],
    );
    await commitAs(
      db,
      { userId: anna },
      "update public.forms set turnstile_enabled = true where id = $1",
      [form],
    );
    expect((await formEntries()).slice(-2)).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "form.turnstile_changed",
        entity_type: "form",
        entity_id: form,
        details: { name: "Kursanmeldung", enabled: false },
      },
      expect.objectContaining({
        actor_id: anna,
        action: "form.turnstile_changed",
        details: { name: "Kursanmeldung", enabled: true },
      }),
    ]);
  });

  it("records closing and reopening", async () => {
    const form = await createForm(firstAid, "Kursanmeldung");
    await commitAs(
      db,
      { userId: max },
      "update public.forms set is_closed = true where id = $1",
      [form],
    );
    await commitAs(
      db,
      { userId: anna },
      "update public.forms set is_closed = false where id = $1",
      [form],
    );
    expect((await formEntries()).slice(-2)).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "form.closed",
        entity_type: "form",
        entity_id: form,
        details: { name: "Kursanmeldung" },
      },
      expect.objectContaining({
        actor_id: anna,
        action: "form.reopened",
        details: { name: "Kursanmeldung" },
      }),
    ]);
  });

  it("records choosing and clearing the Reply-To question", async () => {
    const form = await createForm(firstAid, "Kursanmeldung");
    await commitAs(
      db,
      { userId: max },
      "update public.forms set reply_to_question = 'email' where id = $1",
      [form],
    );
    await commitAs(
      db,
      { userId: anna },
      "update public.forms set reply_to_question = null where id = $1",
      [form],
    );
    expect((await formEntries()).slice(-2)).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "form.reply_to_changed",
        entity_type: "form",
        entity_id: form,
        details: { name: "Kursanmeldung", from: null, to: "email" },
      },
      expect.objectContaining({
        actor_id: anna,
        action: "form.reply_to_changed",
        details: { name: "Kursanmeldung", from: "email", to: null },
      }),
    ]);
  });

  it("records a sender name change with the old and new name", async () => {
    const form = await createForm(firstAid, "Kursanmeldung");
    await commitAs(
      db,
      { userId: max },
      "update public.forms set sender_display_name = 'DRK Kurse' where id = $1",
      [form],
    );
    expect((await formEntries()).at(-1)).toEqual({
      team_id: firstAid,
      actor_id: max,
      action: "form.sender_name_changed",
      entity_type: "form",
      entity_id: form,
      details: { name: "Kursanmeldung", from: "", to: "DRK Kurse" },
    });
  });

  it("records nothing when a save leaves the settings as they were", async () => {
    const form = await createForm(firstAid, "Kursanmeldung");
    const before = (await formEntries()).length;
    await commitAs(
      db,
      { userId: max },
      `update public.forms set name = name, recipients = recipients, turnstile_enabled = turnstile_enabled,
       reply_to_question = reply_to_question, sender_display_name = sender_display_name,
       is_closed = is_closed where id = $1`,
      [form],
    );
    expect(await formEntries()).toHaveLength(before);
  });

  it("is readable by the team's Team Admins", async () => {
    await commitAs(
      db,
      { userId: max },
      "insert into public.forms (team_id, name) values ($1, 'Kursanmeldung')",
      [firstAid],
    );
    expect(
      await queryAs(
        db,
        { userId: anna },
        "select action from public.audit_log where entity_type = 'form'",
      ),
    ).toEqual([{ action: "form.created" }]);
  });
});

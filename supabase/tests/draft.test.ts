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
let anna: string; // member of Erste Hilfe
let max: string; // member of Erste Hilfe
let bea: string; // member of Blutspende
let form: string; // Erste Hilfe's form

const QUESTIONS = {
  pages: [
    {
      name: "seite1",
      elements: [{ type: "text", name: "vorname", title: "Vorname" }],
    },
  ],
};

const SAVE =
  "update public.forms set draft_schema = $2 where id = $1 returning id";

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
    "insert into public.forms (team_id, name) values ($1, 'Kursanmeldung') returning id",
    [firstAid],
  );
  form = rows[0].id;
});

async function draft() {
  const { rows } = await db.query<{
    draft_schema: unknown;
    draft_updated_by: string | null;
    draft_updated_at: Date;
  }>(
    "select draft_schema, draft_updated_by, draft_updated_at from public.forms where id = $1",
    [form],
  );
  return rows[0];
}

describe("saving the draft", () => {
  it("stores the questions with who saved them and when", async () => {
    const before = await draft();
    await commitAs(db, { userId: max }, SAVE, [form, QUESTIONS]);

    const after = await draft();
    expect(after.draft_schema).toEqual(QUESTIONS);
    expect(after.draft_updated_by).toBe(max);
    expect(after.draft_updated_at.getTime()).toBeGreaterThan(
      before.draft_updated_at.getTime(),
    );
  });

  it("is open to a Super Admin outside the team", async () => {
    await commitAs(db, { userId: root }, SAVE, [form, QUESTIONS]);
    expect((await draft()).draft_updated_by).toBe(root);
  });

  it("is last-write-wins between team members", async () => {
    await commitAs(db, { userId: max }, SAVE, [form, QUESTIONS]);
    await commitAs(db, { userId: anna }, SAVE, [form, { pages: [] }]);

    const after = await draft();
    expect(after.draft_schema).toEqual({ pages: [] });
    expect(after.draft_updated_by).toBe(anna);
  });

  it("keeps who and when if nothing changed", async () => {
    await commitAs(db, { userId: max }, SAVE, [form, QUESTIONS]);
    const saved = await draft();
    await commitAs(db, { userId: anna }, SAVE, [form, QUESTIONS]);
    expect(await draft()).toEqual(saved);
  });

  it("is not possible for another team's member", async () => {
    expect(await queryAs(db, { userId: bea }, SAVE, [form, QUESTIONS])).toEqual(
      [],
    );
  });

  it("is not possible for anon", async () => {
    await expect(queryAs(db, "anon", SAVE, [form, QUESTIONS])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot claim someone else saved it, or when", async () => {
    await expect(
      queryAs(
        db,
        { userId: max },
        "update public.forms set draft_updated_by = $2 where id = $1",
        [form, anna],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(
        db,
        { userId: max },
        "update public.forms set draft_updated_at = now() - interval '1 day' where id = $1",
        [form],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("needs a JSON object", async () => {
    await expect(
      queryAs(db, { userId: max }, SAVE, [form, JSON.stringify([1, 2])]),
    ).rejects.toThrow(/forms_draft_schema_check/);
  });

  it("does not change what visitors see", async () => {
    await commitAs(db, { userId: max }, SAVE, [form, QUESTIONS]);
    const { rows } = await db.query(
      "select current_version, is_closed, archived_at from public.forms where id = $1",
      [form],
    );
    expect(rows).toEqual([
      { current_version: null, is_closed: false, archived_at: null },
    ]);
  });

  it("is not recorded in the audit log (publishing is)", async () => {
    const count = async () =>
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from public.audit_log",
        )
      ).rows[0].n;
    const before = await count();
    await commitAs(db, { userId: max }, SAVE, [form, QUESTIONS]);
    expect(await count()).toBe(before);
  });
});

describe("file and signature questions", () => {
  const withQuestion = (question: Record<string, unknown>) => ({
    pages: [{ name: "seite1", elements: [question] }],
  });

  it.each([
    ["a file question", withQuestion({ type: "file", name: "anhang" })],
    [
      "a signature question",
      withQuestion({ type: "signaturepad", name: "unterschrift" }),
    ],
    [
      "a signature question in a dynamic panel",
      withQuestion({
        type: "paneldynamic",
        name: "personen",
        templateElements: [{ type: "signaturepad", name: "unterschrift" }],
      }),
    ],
    [
      "a file question in a panel, typed in upper case",
      withQuestion({
        type: "panel",
        name: "block",
        elements: [{ type: "File", name: "anhang" }],
      }),
    ],
  ])("are refused: %s", async (_case, schema) => {
    await expect(
      queryAs(db, { userId: max }, SAVE, [form, schema]),
    ).rejects.toThrow(/forms_draft_schema_question_types_check/);
  });

  it("do not block other uses of the word", async () => {
    const schema = withQuestion({
      type: "text",
      name: "file",
      title: "signaturepad",
      validators: [{ type: "regex", text: "file" }],
    });
    expect(
      await queryAs(db, { userId: max }, SAVE, [form, schema]),
    ).toHaveLength(1);
  });
});

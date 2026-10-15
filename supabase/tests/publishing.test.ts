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
  pages: [
    {
      name: "seite1",
      elements: [{ type: "text", name: "vorname", title: "Vorname" }],
    },
  ],
};

const PUBLISH = "select public.publish_form($1, $2) as version";

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

async function publish(
  userId: string,
  changelog: string | null = null,
): Promise<number> {
  const [row] = await commitAs<{ version: number }>(db, { userId }, PUBLISH, [
    form,
    changelog,
  ]);
  return row.version;
}

async function versions() {
  const { rows } = await db.query<{
    version: number;
    schema: unknown;
    email_template: unknown;
    changelog: string | null;
    created_by: string | null;
  }>(
    "select version, schema, email_template, changelog, created_by from public.form_versions where form_id = $1 order by version",
    [form],
  );
  return rows;
}

async function currentVersion(): Promise<number | null> {
  const { rows } = await db.query<{ current_version: number | null }>(
    "select current_version from public.forms where id = $1",
    [form],
  );
  return rows[0].current_version;
}

describe("a new form's draft", () => {
  it("starts with the default email template: Standard Layout, a greeting and the answers table", async () => {
    const { rows } = await db.query<{
      draft_email_template: { mode: string; subject: string; body: string };
    }>("select draft_email_template from public.forms where id = $1", [form]);
    const template = rows[0].draft_email_template;
    expect(template.mode).toBe("standard");
    expect(template.subject).toContain("{{form.name}}");
    expect(template.body).toMatch(/^<p>Hallo,<\/p>/);
    expect(template.body).toContain("{{answers_table}}");
  });

  it("is not yet published", async () => {
    expect(await currentVersion()).toBeNull();
    expect(await versions()).toEqual([]);
  });
});

describe("publishing", () => {
  it("copies the draft's questions and email template into version 1 and makes it current", async () => {
    expect(await publish(max, "Erste Fassung")).toBe(1);

    const { rows } = await db.query<{ draft_email_template: unknown }>(
      "select draft_email_template from public.forms where id = $1",
      [form],
    );
    expect(await versions()).toEqual([
      {
        version: 1,
        schema: QUESTIONS,
        email_template: rows[0].draft_email_template,
        changelog: "Erste Fassung",
        created_by: max,
      },
    ]);
    expect(await currentVersion()).toBe(1);
  });

  it("numbers versions strictly increasing and moves the current version", async () => {
    expect(await publish(max)).toBe(1);
    await commitAs(
      db,
      { userId: max },
      'update public.forms set draft_schema = \'{"elements":[{"type":"comment","name":"frage"}]}\' where id = $1',
      [form],
    );
    expect(await publish(anna)).toBe(2);

    const all = await versions();
    expect(all.map((v) => v.version)).toEqual([1, 2]);
    expect(all[0].schema).toEqual(QUESTIONS);
    expect(all[1].schema).toEqual({
      elements: [{ type: "comment", name: "frage" }],
    });
    expect(await currentVersion()).toBe(2);
  });

  it("numbers each form's versions on their own", async () => {
    await publish(max);
    const { rows } = await db.query<{ id: string }>(
      "insert into public.forms (team_id, name, draft_schema) values ($1, 'Feedback', $2) returning id",
      [firstAid, QUESTIONS],
    );
    const [other] = await commitAs<{ version: number }>(
      db,
      { userId: max },
      PUBLISH,
      [rows[0].id, null],
    );
    expect(other.version).toBe(1);
  });

  it("stores no changelog when none or only blanks are given", async () => {
    await publish(max, "   ");
    expect((await versions())[0].changelog).toBeNull();
  });

  it("trims the changelog", async () => {
    await publish(max, "  Neue Frage  ");
    expect((await versions())[0].changelog).toBe("Neue Frage");
  });

  it("refuses a changelog over 2000 characters", async () => {
    await expect(publish(max, "x".repeat(2001))).rejects.toThrow(
      /form_versions_changelog_check/,
    );
  });

  it("leaves the draft as it is", async () => {
    const before = await db.query(
      "select draft_schema, draft_email_template, draft_updated_by, draft_updated_at from public.forms where id = $1",
      [form],
    );
    await publish(max);
    const after = await db.query(
      "select draft_schema, draft_email_template, draft_updated_by, draft_updated_at from public.forms where id = $1",
      [form],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("is open to a Super Admin outside the team", async () => {
    expect(await publish(root)).toBe(1);
    expect((await versions())[0].created_by).toBe(root);
  });

  it("is refused for another team's member, and nothing changes", async () => {
    await expect(
      queryAs(db, { userId: bea }, PUBLISH, [form, null]),
    ).rejects.toThrow(/may publish it/);
    expect(await versions()).toEqual([]);
    expect(await currentVersion()).toBeNull();
  });

  it("is refused for an unknown form", async () => {
    await expect(
      queryAs(db, { userId: root }, PUBLISH, [
        "00000000-0000-4000-8000-000000000000",
        null,
      ]),
    ).rejects.toThrow(/may publish it/);
  });

  it("is refused for anon and the secret key (service role)", async () => {
    await expect(queryAs(db, "anon", PUBLISH, [form, null])).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      commitAs(db, "service", PUBLISH, [form, null]),
    ).rejects.toThrow(/permission denied/);
  });

  it("refuses a draft without questions", async () => {
    for (const schema of [{}, { pages: [] }, { pages: [{ name: "p1" }] }]) {
      await db.query(
        "update public.forms set draft_schema = $2 where id = $1",
        [form, schema],
      );
      await expect(
        queryAs(db, { userId: max }, PUBLISH, [form, null]),
      ).rejects.toThrow(/no questions/);
    }
    expect(await versions()).toEqual([]);
  });

  it("accepts questions outside pages", async () => {
    await db.query("update public.forms set draft_schema = $2 where id = $1", [
      form,
      { elements: [{ type: "text", name: "frage" }] },
    ]);
    expect(await publish(max)).toBe(1);
  });

  it("is recorded in the audit log, in the same transaction", async () => {
    await publish(max, "Erste Fassung");
    const { rows } = await db.query(
      "select team_id, actor_id, action, entity_type, entity_id, details from public.audit_log where action = 'form.published'",
    );
    expect(rows).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "form.published",
        entity_type: "form",
        entity_id: form,
        details: {
          name: "Kursanmeldung",
          version: 1,
          changelog: "Erste Fassung",
        },
      },
    ]);
  });
});

describe("form versions", () => {
  beforeEach(async () => {
    await publish(max, "Erste Fassung");
  });

  it("are visible to the owning team and Super Admins only", async () => {
    const select = "select version from public.form_versions";
    expect(await queryAs(db, { userId: max }, select)).toEqual([
      { version: 1 },
    ]);
    expect(await queryAs(db, { userId: root }, select)).toEqual([
      { version: 1 },
    ]);
    expect(await queryAs(db, { userId: bea }, select)).toEqual([]);
    await expect(queryAs(db, "anon", select)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot be written directly by anyone signed in", async () => {
    for (const statement of [
      "insert into public.form_versions (form_id, version, schema, email_template) values ($1, 2, '{}', '{}')",
      "update public.form_versions set changelog = 'geändert' where form_id = $1",
      "delete from public.form_versions where form_id = $1",
    ]) {
      await expect(
        queryAs(db, { userId: root }, statement, [form]),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it("cannot be written with the secret key (service role)", async () => {
    await expect(
      commitAs(
        db,
        "service",
        "update public.form_versions set changelog = 'geändert' where form_id = $1",
        [form],
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("are immutable, even for the table owner", async () => {
    await expect(
      db.query(
        "update public.form_versions set schema = '{}' where form_id = $1",
        [form],
      ),
    ).rejects.toThrow(/immutable/);
    await expect(
      db.query("delete from public.form_versions where form_id = $1", [form]),
    ).rejects.toThrow(/immutable/);
  });

  it("keep their numbers strictly increasing, even for the table owner", async () => {
    for (const version of [1, 3]) {
      await expect(
        db.query(
          "insert into public.form_versions (form_id, version, schema, email_template) values ($1, $2, '{}', '{}')",
          [form, version],
        ),
      ).rejects.toThrow(/strictly increasing/);
    }
  });

  it("keep the publisher's account optional: a deleted account leaves the version", async () => {
    await db.query("delete from auth.users where id = $1", [max]);
    const [version] = await versions();
    expect(version.version).toBe(1);
    expect(version.created_by).toBeNull();
  });

  it("go with their form when it is deleted for good", async () => {
    await db.query("delete from public.forms where id = $1", [form]);
    expect(await versions()).toEqual([]);
  });

  it("must exist to be current", async () => {
    await expect(
      db.query("update public.forms set current_version = 2 where id = $1", [
        form,
      ]),
    ).rejects.toThrow(/forms_current_version_fkey/);
  });
});

it("snapshots a custom theme and then inheritance without changing earlier versions", async () => {
  const theme = { cssVariables: { "--sjs-primary-backcolor": "#123456" } };
  await commitAs(
    db,
    { userId: max },
    "update public.forms set draft_theme = $2 where id = $1",
    [form, theme],
  );
  await publish(max);
  await commitAs(
    db,
    { userId: max },
    "update public.forms set draft_theme = null where id = $1",
    [form],
  );
  await publish(max);
  const rows = await queryAs(
    db,
    { userId: max },
    "select version, theme from public.form_versions where form_id = $1 order by version",
    [form],
  );
  expect(rows).toEqual([
    { version: 1, theme },
    { version: 2, theme: null },
  ]);
  await expect(
    db.query(
      "update public.form_versions set theme = '{}' where form_id = $1",
      [form],
    ),
  ).rejects.toThrow(/immutable/);
});

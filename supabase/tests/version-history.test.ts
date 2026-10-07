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
let max: string; // member of Erste Hilfe
let anna: string; // member of Erste Hilfe
let bea: string; // member of Blutspende
let form: string; // Erste Hilfe's form

const FIRST = {
  pages: [{ name: "p1", elements: [{ type: "text", name: "vorname" }] }],
};
const SECOND = { elements: [{ type: "comment", name: "anliegen" }] };
const EDITED = { elements: [{ type: "text", name: "unveröffentlicht" }] };

const FIRST_TEMPLATE = {
  mode: "standard",
  subject: "Erste Vorlage",
  body: "<p>Eins</p>",
};
const SECOND_TEMPLATE = {
  mode: "custom",
  subject: "Zweite Vorlage",
  body: "<html><body>Zwei</body></html>",
};

const RESTORE = "select public.restore_form_version($1, $2)";
const DISCARD = "select public.discard_draft_changes($1)";

beforeEach(async () => {
  db = await migratedDatabase();
  firstAid = await createTeam(db, "Erste Hilfe");
  const bloodDrive = await createTeam(db, "Blutspende");
  root = await createSuperAdmin(db, "root@drk-rostock.de");
  max = await createAuthUser(db, "max@drk-rostock.de");
  anna = await createAuthUser(db, "anna@drk-rostock.de");
  bea = await createAuthUser(db, "bea@drk-rostock.de");
  await addTeamMember(db, firstAid, max, "member");
  await addTeamMember(db, firstAid, anna, "member");
  await addTeamMember(db, bloodDrive, bea, "member");
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name) values ($1, 'Kursanmeldung') returning id",
    [firstAid],
  );
  form = rows[0].id;
});

async function saveDraft(schema: unknown, template: unknown) {
  await commitAs(
    db,
    { userId: max },
    "update public.forms set draft_schema = $2, draft_email_template = $3 where id = $1",
    [form, schema, template],
  );
}

async function publish(changelog: string | null = null): Promise<number> {
  const [row] = await commitAs<{ version: number }>(
    db,
    { userId: max },
    "select public.publish_form($1, $2) as version",
    [form, changelog],
  );
  return row.version;
}

/** Versions 1 (FIRST) and 2 (SECOND, current), and an unpublished edit in the draft. */
async function publishTwoVersionsAndEdit() {
  await saveDraft(FIRST, FIRST_TEMPLATE);
  await publish("Erste Fassung");
  await saveDraft(SECOND, SECOND_TEMPLATE);
  await publish("Zweite Fassung");
  await saveDraft(EDITED, FIRST_TEMPLATE);
}

async function draft() {
  const { rows } = await db.query<{
    draft_schema: unknown;
    draft_email_template: unknown;
    draft_updated_by: string | null;
    current_version: number | null;
  }>(
    "select draft_schema, draft_email_template, draft_updated_by, current_version from public.forms where id = $1",
    [form],
  );
  return rows[0];
}

async function versionNumbers(): Promise<number[]> {
  const { rows } = await db.query<{ version: number }>(
    "select version from public.form_versions where form_id = $1 order by version",
    [form],
  );
  return rows.map((row) => row.version);
}

async function auditEntries(action: string) {
  const { rows } = await db.query(
    "select team_id, actor_id, entity_type, entity_id, details from public.audit_log where action = $1",
    [action],
  );
  return rows;
}

describe("restoring a version", () => {
  beforeEach(publishTwoVersionsAndEdit);

  it("copies the version's questions and email template into the draft", async () => {
    await commitAs(db, { userId: anna }, RESTORE, [form, 1]);
    expect(await draft()).toEqual({
      draft_schema: FIRST,
      draft_email_template: FIRST_TEMPLATE,
      draft_updated_by: anna,
      current_version: 2,
    });
  });

  it("leaves the versions and the current version alone; publishing it makes the next version", async () => {
    await commitAs(db, { userId: anna }, RESTORE, [form, 1]);
    expect(await versionNumbers()).toEqual([1, 2]);
    expect((await draft()).current_version).toBe(2);

    expect(await publish()).toBe(3);
    const { rows } = await db.query(
      "select schema, email_template from public.form_versions where form_id = $1 and version = 3",
      [form],
    );
    expect(rows).toEqual([{ schema: FIRST, email_template: FIRST_TEMPLATE }]);
  });

  it("is recorded in the audit log, in the same transaction", async () => {
    await commitAs(db, { userId: anna }, RESTORE, [form, 1]);
    expect(await auditEntries("form.version_restored")).toEqual([
      {
        team_id: firstAid,
        actor_id: anna,
        entity_type: "form",
        entity_id: form,
        details: { name: "Kursanmeldung", version: 1 },
      },
    ]);
  });

  it("is open to a Super Admin outside the team", async () => {
    await commitAs(db, { userId: root }, RESTORE, [form, 1]);
    expect((await draft()).draft_schema).toEqual(FIRST);
  });

  it("is refused for another team's member, and nothing changes", async () => {
    await expect(
      commitAs(db, { userId: bea }, RESTORE, [form, 1]),
    ).rejects.toThrow(/may restore/);
    expect((await draft()).draft_schema).toEqual(EDITED);
    expect(await auditEntries("form.version_restored")).toEqual([]);
  });

  it("is refused for an unknown form", async () => {
    await expect(
      queryAs(db, { userId: root }, RESTORE, [
        "00000000-0000-4000-8000-000000000000",
        1,
      ]),
    ).rejects.toThrow(/may restore/);
  });

  it("is refused for a version the form does not have", async () => {
    await expect(
      commitAs(db, { userId: max }, RESTORE, [form, 3]),
    ).rejects.toThrow(/no version 3/);
    expect((await draft()).draft_schema).toEqual(EDITED);
  });

  it("is refused for anon and the secret key (service role)", async () => {
    await expect(queryAs(db, "anon", RESTORE, [form, 1])).rejects.toThrow(
      /permission denied/,
    );
    await expect(commitAs(db, "service", RESTORE, [form, 1])).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("discarding changes", () => {
  it("resets the draft to the current version", async () => {
    await publishTwoVersionsAndEdit();
    await commitAs(db, { userId: anna }, DISCARD, [form]);
    expect(await draft()).toEqual({
      draft_schema: SECOND,
      draft_email_template: SECOND_TEMPLATE,
      draft_updated_by: anna,
      current_version: 2,
    });
    expect(await versionNumbers()).toEqual([1, 2]);
  });

  it("resets to the current version, not the newest, after a restore was published", async () => {
    await publishTwoVersionsAndEdit();
    await commitAs(db, { userId: max }, RESTORE, [form, 1]);
    await publish();
    await saveDraft(EDITED, SECOND_TEMPLATE);
    await commitAs(db, { userId: max }, DISCARD, [form]);
    expect((await draft()).draft_schema).toEqual(FIRST);
    expect(await versionNumbers()).toEqual([1, 2, 3]);
  });

  it("is recorded in the audit log with the version it reset to", async () => {
    await publishTwoVersionsAndEdit();
    await commitAs(db, { userId: anna }, DISCARD, [form]);
    expect(await auditEntries("form.draft_discarded")).toEqual([
      {
        team_id: firstAid,
        actor_id: anna,
        entity_type: "form",
        entity_id: form,
        details: { name: "Kursanmeldung", version: 2 },
      },
    ]);
  });

  it("is refused while the form is not yet published", async () => {
    await saveDraft(EDITED, FIRST_TEMPLATE);
    await expect(
      commitAs(db, { userId: max }, DISCARD, [form]),
    ).rejects.toThrow(/not yet published/);
    expect((await draft()).draft_schema).toEqual(EDITED);
    expect(await auditEntries("form.draft_discarded")).toEqual([]);
  });

  it("is open to a Super Admin and refused for another team's member", async () => {
    await publishTwoVersionsAndEdit();
    await expect(
      commitAs(db, { userId: bea }, DISCARD, [form]),
    ).rejects.toThrow(/may discard/);
    expect((await draft()).draft_schema).toEqual(EDITED);
    await commitAs(db, { userId: root }, DISCARD, [form]);
    expect((await draft()).draft_schema).toEqual(SECOND);
  });

  it("is refused for anon and the secret key (service role)", async () => {
    await publishTwoVersionsAndEdit();
    await expect(queryAs(db, "anon", DISCARD, [form])).rejects.toThrow(
      /permission denied/,
    );
    await expect(commitAs(db, "service", DISCARD, [form])).rejects.toThrow(
      /permission denied/,
    );
  });
});

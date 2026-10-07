import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STANDARD_BODY,
  EMAIL_BODY_MAX_LENGTH,
  EMAIL_SUBJECT_MAX_LENGTH,
} from "../../lib/forms/email-template.ts";
import {
  addTeamMember,
  commitAs,
  createAuthUser,
  createTeam,
  migratedDatabase,
  queryAs,
} from "./database.ts";

let db: PGlite;
let max: string; // member of Erste Hilfe
let bea: string; // member of Blutspende
let form: string; // Erste Hilfe's form

const QUESTIONS = {
  pages: [{ name: "seite1", elements: [{ type: "text", name: "vorname" }] }],
};

const TEMPLATE = {
  mode: "standard",
  subject: "Anmeldung von {{answers.vorname}}",
  body: "<p>Hallo,</p><p>{{answers.vorname}} hat sich angemeldet.</p>",
};

const SAVE =
  "update public.forms set draft_email_template = $2 where id = $1 returning id";

beforeEach(async () => {
  db = await migratedDatabase();
  const firstAid = await createTeam(db, "Erste Hilfe");
  const bloodDrive = await createTeam(db, "Blutspende");
  max = await createAuthUser(db, "max@drk-rostock.de");
  bea = await createAuthUser(db, "bea@drk-rostock.de");
  await addTeamMember(db, firstAid, max, "member");
  await addTeamMember(db, bloodDrive, bea, "member");
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name, draft_schema) values ($1, 'Kursanmeldung', $2) returning id",
    [firstAid, QUESTIONS],
  );
  form = rows[0].id;
});

async function draft() {
  const { rows } = await db.query<{
    draft_email_template: unknown;
    draft_updated_by: string | null;
  }>(
    "select draft_email_template, draft_updated_by from public.forms where id = $1",
    [form],
  );
  return rows[0];
}

describe("a new form's email template", () => {
  it("is the Standard Layout with the default body", async () => {
    expect((await draft()).draft_email_template).toMatchObject({
      mode: "standard",
      body: DEFAULT_STANDARD_BODY,
    });
  });
});

describe("saving the email template", () => {
  it("stores the template in the draft, stamped with who saved it", async () => {
    await commitAs(db, { userId: max }, SAVE, [form, TEMPLATE]);

    expect(await draft()).toEqual({
      draft_email_template: TEMPLATE,
      draft_updated_by: max,
    });
  });

  it("stores a Custom HTML Template", async () => {
    const custom = {
      mode: "custom",
      subject: "Anmeldung",
      body: "<!doctype html><html><body>{{answers_table}}</body></html>",
    };
    await commitAs(db, { userId: max }, SAVE, [form, custom]);

    expect((await draft()).draft_email_template).toEqual(custom);
  });

  it("is not possible for another team's member", async () => {
    expect(await queryAs(db, { userId: bea }, SAVE, [form, TEMPLATE])).toEqual(
      [],
    );
  });

  it("is not possible for anon", async () => {
    await expect(queryAs(db, "anon", SAVE, [form, TEMPLATE])).rejects.toThrow(
      /permission denied/,
    );
  });

  it.each([
    ["an unknown mode", { ...TEMPLATE, mode: "mjml" }],
    ["no subject", { mode: "standard", body: "" }],
    ["a body that is no text", { ...TEMPLATE, body: 1 }],
    [
      "a subject that is too long",
      { ...TEMPLATE, subject: "x".repeat(EMAIL_SUBJECT_MAX_LENGTH + 1) },
    ],
    [
      "a body that is too long",
      { ...TEMPLATE, body: "x".repeat(EMAIL_BODY_MAX_LENGTH + 1) },
    ],
  ])("refuses %s", async (_, template) => {
    await expect(
      queryAs(db, { userId: max }, SAVE, [form, template]),
    ).rejects.toThrow(/forms_draft_email_template_shape_check/);
  });

  it("accepts the longest subject and body", async () => {
    const template = {
      mode: "standard",
      subject: "x".repeat(EMAIL_SUBJECT_MAX_LENGTH),
      body: "x".repeat(EMAIL_BODY_MAX_LENGTH),
    };
    expect(
      await queryAs(db, { userId: max }, SAVE, [form, template]),
    ).toHaveLength(1);
  });
});

describe("the dispatcher", () => {
  it("renders with the template of the submitted version, not a later one", async () => {
    const publish = () =>
      commitAs(db, { userId: max }, "select public.publish_form($1)", [form]);
    await commitAs(db, { userId: max }, SAVE, [form, TEMPLATE]);
    await publish();
    await commitAs(db, { userId: max }, SAVE, [
      form,
      { ...TEMPLATE, subject: "Version 2" },
    ]);
    await publish();

    const dispatched = (version: number) =>
      commitAs<{ email_template: unknown }>(
        db,
        "service",
        "select email_template from public.dispatch_submission(gen_random_uuid(), $1, $2)",
        [form, version],
      );

    expect(await dispatched(1)).toEqual([{ email_template: TEMPLATE }]);
    expect(await dispatched(2)).toEqual([
      { email_template: { ...TEMPLATE, subject: "Version 2" } },
    ]);
  });
});

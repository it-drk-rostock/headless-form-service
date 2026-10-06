import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addTeamMember,
  commitAs,
  createAuthUser,
  createTeam,
  migratedDatabase,
  queryAs,
} from "./database.ts";

let db: PGlite;
let firstAid: string;
let max: string; // member of Erste Hilfe
let form: string; // Erste Hilfe's form

const questions = (name: string) => ({
  pages: [{ name: "seite1", elements: [{ type: "text", name }] }],
});

const LOAD = "select * from public.load_form($1)";
const COUNT = "select public.count_form_load($1)";

beforeEach(async () => {
  db = await migratedDatabase();
  firstAid = await createTeam(db, "Erste Hilfe");
  max = await createAuthUser(db, "max@drk-rostock.de");
  await addTeamMember(db, firstAid, max, "member");
  form = await createForm(firstAid);
});

async function createForm(teamId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name, draft_schema) values ($1, 'Kursanmeldung', $2) returning id",
    [teamId, questions("vorname")],
  );
  return rows[0].id;
}

async function publish(schema: unknown): Promise<void> {
  await db.query("update public.forms set draft_schema = $2 where id = $1", [
    form,
    schema,
  ]);
  await commitAs(db, { userId: max }, "select public.publish_form($1)", [form]);
}

async function loadCounts() {
  const { rows } = await db.query<{ form_id: string; count: number }>(
    "select form_id, count from public.form_load_counts order by count",
  );
  return rows;
}

describe("load_form", () => {
  it("serves the current version's number, questions and access type", async () => {
    await publish(questions("vorname"));
    await publish(questions("nachname"));

    expect(await commitAs(db, "service", LOAD, [form])).toEqual([
      { version: 2, schema: questions("nachname"), access_type: "public" },
    ]);
  });

  it("serves nothing for an unknown form", async () => {
    expect(
      await commitAs(db, "service", LOAD, [
        "00000000-0000-4000-8000-000000000000",
      ]),
    ).toEqual([]);
  });

  it("serves nothing for a form that was never published", async () => {
    expect(await commitAs(db, "service", LOAD, [form])).toEqual([]);
  });

  it("serves nothing for an archived form", async () => {
    await publish(questions("vorname"));
    await db.query(
      "update public.forms set archived_at = now() where id = $1",
      [form],
    );

    expect(await commitAs(db, "service", LOAD, [form])).toEqual([]);
  });

  it("is not callable by visitors or signed-in people", async () => {
    await publish(questions("vorname"));

    await expect(queryAs(db, "anon", LOAD, [form])).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      queryAs(db, { userId: max }, LOAD, [form]),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("count_form_load", () => {
  it("counts loads per form for today in Europe/Berlin", async () => {
    const other = await createForm(firstAid);

    await commitAs(db, "service", COUNT, [form]);
    await commitAs(db, "service", COUNT, [form]);
    await commitAs(db, "service", COUNT, [other]);

    expect(await loadCounts()).toEqual([
      { form_id: other, count: 1 },
      { form_id: form, count: 2 },
    ]);
    const { rows } = await db.query<{ today: boolean }>(
      "select bool_and(day = (now() at time zone 'Europe/Berlin')::date) as today from public.form_load_counts",
    );
    expect(rows[0].today).toBe(true);
  });

  it("starts a new count on a new day", async () => {
    await db.query(
      "insert into public.form_load_counts (form_id, day, count) values ($1, '2026-01-01', 7)",
      [form],
    );

    await commitAs(db, "service", COUNT, [form]);

    expect(await loadCounts()).toEqual([
      { form_id: form, count: 1 },
      { form_id: form, count: 7 },
    ]);
  });

  it("is not callable by visitors or signed-in people", async () => {
    await expect(queryAs(db, "anon", COUNT, [form])).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      queryAs(db, { userId: max }, COUNT, [form]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot be bypassed by writing the counts directly", async () => {
    for (const who of ["anon", { userId: max }] as const) {
      await expect(
        queryAs(db, who, "select * from public.form_load_counts"),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      commitAs(
        db,
        "service",
        "update public.form_load_counts set count = 1000",
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("settings", () => {
  it("is seeded with the local dashboard as the only allowed origin", async () => {
    expect(
      await commitAs(
        db,
        "service",
        "select allowed_origins from public.settings",
      ),
    ).toEqual([{ allowed_origins: ["http://localhost:3000"] }]);
  });

  it("starts with 60 loads and 10 submissions per minute and IP", async () => {
    expect(
      await commitAs(
        db,
        "service",
        "select load_rate_limit, submit_rate_limit from public.settings",
      ),
    ).toEqual([{ load_rate_limit: 60, submit_rate_limit: 10 }]);
  });

  it.each([
    "load_rate_limit = 0",
    "submit_rate_limit = -1",
    "load_rate_limit = null",
  ])("refuses a rate limit below one, or none: %s", async (set) => {
    await expect(
      db.query(`update public.settings set ${set}`),
    ).rejects.toMatchObject({ code: expect.stringMatching(/^23(514|502)$/) });
  });

  it("holds a single row", async () => {
    await expect(
      db.query("insert into public.settings (allowed_origins) values ('{}')"),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("is hidden from visitors and signed-in people, and read-only for edge functions", async () => {
    for (const who of ["anon", { userId: max }] as const) {
      await expect(
        queryAs(db, who, "select * from public.settings"),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      commitAs(
        db,
        "service",
        "update public.settings set allowed_origins = '{https://evil.example}'",
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

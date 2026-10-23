import type { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addTeamMember,
  commitAs,
  createAuthUser,
  createTeam,
  migratedDatabase,
  queryAs,
} from "./database.ts";

let db: PGlite;
let team: string;
let member: string;
let form: string;

const HASH = "b".repeat(64);
const EXPIRES = new Date(Date.now() + 48 * 3_600_000).toISOString();
const CREATE =
  "select public.create_n8n_form_pass($1, $2, $3, $4, $5) as page_url";

beforeEach(async () => {
  db = await migratedDatabase();
  team = await createTeam(db, "Erste Hilfe");
  member = await createAuthUser(db, "max@drk-rostock.de");
  await addTeamMember(db, team, member);
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name, access_type, page_url) values ($1, 'Nachbefragung', 'protected', 'https://www.drk-rostock.de/nachbefragung') returning id",
    [team],
  );
  form = rows[0].id;
});

afterEach(async () => {
  await db.close();
});

function create(
  formId = form,
  maxUses: number | null = 1,
  metadata: unknown = { ticket: "T-17" },
) {
  return commitAs<{ page_url: string | null }>(db, "service", CREATE, [
    formId,
    HASH,
    maxUses,
    EXPIRES,
    JSON.stringify(metadata),
  ]);
}

describe("create_n8n_form_pass", () => {
  it("creates an n8n pass without creator and returns the form page", async () => {
    expect(await create()).toEqual([
      { page_url: "https://www.drk-rostock.de/nachbefragung" },
    ]);

    const { rows } = await db.query(
      "select form_id, token_hash, max_uses, use_count, expires_at, source, created_by, metadata from public.form_passes",
    );
    expect(rows).toEqual([
      {
        form_id: form,
        token_hash: HASH,
        max_uses: 1,
        use_count: 0,
        expires_at: new Date(EXPIRES),
        source: "n8n",
        created_by: null,
        metadata: { ticket: "T-17" },
      },
    ]);
  });

  it("returns no form page when none is set, and allows unlimited uses", async () => {
    await db.query("update public.forms set page_url = null where id = $1", [
      form,
    ]);

    expect(await create(form, null)).toEqual([{ page_url: null }]);
    const { rows } = await db.query("select max_uses from public.form_passes");
    expect(rows).toEqual([{ max_uses: null }]);
  });

  it("is recorded in the audit log as made by the system, with source n8n", async () => {
    await create();

    const { rows } = await db.query(
      "select team_id, actor_id, action, details from public.audit_log where action = 'form_pass.created'",
    );
    expect(rows).toEqual([
      {
        team_id: team,
        actor_id: null,
        action: "form_pass.created",
        // expires_at is written in the session's time zone.
        details: expect.objectContaining({
          name: "Nachbefragung",
          max_uses: 1,
          source: "n8n",
        }),
      },
    ]);
  });

  it("is refused for public forms", async () => {
    await db.query(
      "update public.forms set access_type = 'public' where id = $1",
      [form],
    );

    await expect(create()).rejects.toMatchObject({ code: "HF010" });
  });

  it("is refused for unknown and archived forms", async () => {
    await expect(create(crypto.randomUUID())).rejects.toMatchObject({
      code: "HF011",
    });

    await db.query(
      "update public.forms set archived_at = now() where id = $1",
      [form],
    );
    await expect(create()).rejects.toMatchObject({ code: "HF011" });
  });

  it("refuses metadata that is not flat strings and numbers", async () => {
    await expect(create(form, 1, { nested: { a: 1 } })).rejects.toThrow(
      /form_passes_metadata_check/,
    );
  });

  it("is callable only with the secret key", async () => {
    for (const who of [{ userId: member }, "anon"] as const) {
      await expect(
        queryAs(db, who, CREATE, [form, HASH, 1, EXPIRES, "{}"]),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });
});

const PERSONALIZED =
  "select public.create_personalized_n8n_form_pass($1, $2, $3, $4, $5, $6) as page_url";
const ENVELOPE = {
  v: 1,
  kid: "test",
  iv: "encrypted-iv",
  ct: "encrypted-payload",
};

describe("personalized n8n pass persistence", () => {
  it("atomically stores encrypted context and hides it from dashboard members", async () => {
    await commitAs(db, "service", PERSONALIZED, [
      form,
      HASH,
      1,
      EXPIRES,
      "{}",
      JSON.stringify(ENVELOPE),
    ]);
    const rows = await commitAs<{ encrypted_context: unknown }>(
      db,
      "service",
      "select encrypted_context from public.form_passes where form_id = $1",
      [form],
    );
    expect(rows[0].encrypted_context).toEqual(ENVELOPE);
    expect(
      await queryAs(
        db,
        { userId: member },
        "select metadata from public.form_passes",
      ),
    ).toEqual([{ metadata: {} }]);
    await expect(
      queryAs(
        db,
        { userId: member },
        "select encrypted_context from public.form_passes",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      queryAs(db, "anon", "select encrypted_context from public.form_passes"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("refuses public callers and malformed envelopes without leaving a pass", async () => {
    for (const who of ["anon", { userId: member }] as const) {
      await expect(
        queryAs(db, who, PERSONALIZED, [
          form,
          HASH,
          1,
          EXPIRES,
          "{}",
          JSON.stringify(ENVELOPE),
        ]),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      commitAs(db, "service", PERSONALIZED, [
        form,
        HASH,
        1,
        EXPIRES,
        "{}",
        "{}",
      ]),
    ).rejects.toMatchObject({ code: "22023" });
    expect(
      (await db.query("select * from public.form_passes")).rows,
    ).toHaveLength(0);
  });
  it("prevents a member from updating encrypted context", async () => {
    await create();
    await expect(
      queryAs(
        db,
        { userId: member },
        "update public.form_passes set encrypted_context = $1",
        [JSON.stringify(ENVELOPE)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

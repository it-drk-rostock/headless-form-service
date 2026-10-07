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

const HASH = "a".repeat(64);
const OTHER_HASH = "b".repeat(64);
const CREATE = "select public.create_form_pass($1, $2, $3, $4, $5) as id";
const REVOKE = "select public.revoke_form_pass($1)";

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
    "insert into public.forms (team_id, name, access_type) values ($1, 'Nachbefragung', 'protected') returning id",
    [firstAid],
  );
  form = rows[0].id;
});

async function createPass(
  who: { userId: string },
  {
    hash = HASH,
    maxUses = 1 as number | null,
    expiresAt = null as string | null,
    metadata = {} as unknown,
  } = {},
): Promise<string> {
  const rows = await commitAs<{ id: string }>(db, who, CREATE, [
    form,
    hash,
    maxUses,
    expiresAt,
    JSON.stringify(metadata),
  ]);
  return rows[0].id;
}

async function passEntries() {
  const { rows } = await db.query<{
    team_id: string;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string;
    details: Record<string, unknown>;
  }>(
    `select team_id, actor_id, action, entity_type, entity_id, details
     from public.audit_log where action like 'form_pass.%' order by id`,
  );
  return rows;
}

describe("the form page and access type", () => {
  it("can be set by members of the owning team", async () => {
    const rows = await queryAs(
      db,
      { userId: max },
      `update public.forms set access_type = 'public', page_url = 'https://www.drk-rostock.de/kurs'
       where id = $1 returning access_type, page_url`,
      [form],
    );
    expect(rows).toEqual([
      { access_type: "public", page_url: "https://www.drk-rostock.de/kurs" },
    ]);
  });

  it("is not changed for members of other teams", async () => {
    const rows = await queryAs(
      db,
      { userId: bea },
      "update public.forms set access_type = 'public' where id = $1 returning id",
      [form],
    );
    expect(rows).toEqual([]);
  });

  it("must be a web address", async () => {
    for (const url of [
      "javascript:alert(1)",
      "www.drk-rostock.de",
      "https://a b",
    ]) {
      await expect(
        db.query("update public.forms set page_url = $1 where id = $2", [
          url,
          form,
        ]),
      ).rejects.toThrow(/forms_page_url_check/);
    }
  });

  it("records access type and form page changes in the audit log", async () => {
    await commitAs(
      db,
      { userId: max },
      "update public.forms set page_url = 'https://www.drk-rostock.de/kurs' where id = $1",
      [form],
    );
    await commitAs(
      db,
      { userId: max },
      "update public.forms set access_type = 'public' where id = $1",
      [form],
    );
    const { rows } = await db.query(
      `select actor_id, action, details from public.audit_log
       where action in ('form.page_changed', 'form.access_changed') order by id`,
    );
    expect(rows).toEqual([
      {
        actor_id: max,
        action: "form.page_changed",
        details: {
          name: "Nachbefragung",
          from: null,
          to: "https://www.drk-rostock.de/kurs",
        },
      },
      {
        actor_id: max,
        action: "form.access_changed",
        details: { name: "Nachbefragung", to: "public" },
      },
    ]);
  });
});

describe("creating a form pass", () => {
  it("stores the hash, limits and metadata, from the dashboard", async () => {
    const expiresAt = new Date(Date.now() + 48 * 3600_000).toISOString();
    const id = await createPass(
      { userId: max },
      { maxUses: 3, expiresAt, metadata: { ticket: "T-17", kampagne: 4 } },
    );
    const { rows } = await db.query<Record<string, unknown>>(
      `select form_id, token_hash, max_uses, use_count, expires_at, revoked_at,
              source, created_by, metadata
       from public.form_passes where id = $1`,
      [id],
    );
    expect(rows).toEqual([
      {
        form_id: form,
        token_hash: HASH,
        max_uses: 3,
        use_count: 0,
        expires_at: new Date(expiresAt),
        revoked_at: null,
        source: "dashboard",
        created_by: max,
        metadata: { ticket: "T-17", kampagne: 4 },
      },
    ]);
  });

  it("allows passes without use limit and expiry", async () => {
    const id = await createPass({ userId: max }, { maxUses: null });
    const { rows } = await db.query(
      "select max_uses, expires_at from public.form_passes where id = $1",
      [id],
    );
    expect(rows).toEqual([{ max_uses: null, expires_at: null }]);
  });

  it("can be done by a Super Admin for any team", async () => {
    await createPass({ userId: root });
    const { rows } = await db.query(
      "select count(*)::int as n from public.form_passes",
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("is refused to members of other teams and to visitors", async () => {
    await expect(
      queryAs(db, { userId: bea }, CREATE, [form, HASH, 1, null, "{}"]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      queryAs(db, "anon", CREATE, [form, HASH, 1, null, "{}"]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("is refused for public forms", async () => {
    await db.query(
      "update public.forms set access_type = 'public' where id = $1",
      [form],
    );
    await expect(
      queryAs(db, { userId: max }, CREATE, [form, HASH, 1, null, "{}"]),
    ).rejects.toMatchObject({ code: "HF010" });
  });

  it("refuses metadata that is not flat strings and numbers", async () => {
    for (const metadata of [
      [],
      "T-17",
      { nested: { a: 1 } },
      { list: [1] },
      { flag: true },
      { empty: null },
      { "mit leerzeichen": "x" },
      { ticket: "x".repeat(501) },
      Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, i])),
    ]) {
      await expect(
        queryAs(db, { userId: max }, CREATE, [
          form,
          HASH,
          1,
          null,
          JSON.stringify(metadata),
        ]),
        JSON.stringify(metadata),
      ).rejects.toThrow(/form_passes_metadata_check/);
    }
  });

  it("refuses bad hashes, limits and expiry times", async () => {
    await expect(
      queryAs(db, { userId: max }, CREATE, [form, "secret", 1, null, "{}"]),
    ).rejects.toThrow(/form_passes_token_hash_check/);
    await expect(
      queryAs(db, { userId: max }, CREATE, [form, HASH, 0, null, "{}"]),
    ).rejects.toThrow(/form_passes_max_uses_check/);
    await expect(
      queryAs(db, { userId: max }, CREATE, [
        form,
        HASH,
        1,
        "2020-01-01T00:00:00Z",
        "{}",
      ]),
    ).rejects.toThrow(/form_passes_expires_at_check/);
  });

  it("refuses a hash that is already taken", async () => {
    await createPass({ userId: max });
    await expect(
      queryAs(db, { userId: max }, CREATE, [form, HASH, 1, null, "{}"]),
    ).rejects.toThrow(/form_passes_token_hash_key/);
  });

  it("is recorded in the audit log, without the hash or metadata", async () => {
    const id = await createPass(
      { userId: max },
      { maxUses: null, metadata: { ticket: "T-17" } },
    );
    expect(await passEntries()).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "form_pass.created",
        entity_type: "form_pass",
        entity_id: id,
        details: {
          name: "Nachbefragung",
          max_uses: null,
          expires_at: null,
          source: "dashboard",
        },
      },
    ]);
  });
});

describe("reading form passes", () => {
  it("shows a team's passes to its members and Super Admins only", async () => {
    await createPass({ userId: max });
    const query = "select max_uses from public.form_passes";
    expect(await queryAs(db, { userId: anna }, query)).toEqual([
      { max_uses: 1 },
    ]);
    expect(await queryAs(db, { userId: root }, query)).toEqual([
      { max_uses: 1 },
    ]);
    expect(await queryAs(db, { userId: bea }, query)).toEqual([]);
    await expect(queryAs(db, "anon", query)).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("never shows the hash", async () => {
    await createPass({ userId: max });
    await expect(
      queryAs(db, { userId: max }, "select token_hash from public.form_passes"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot be written directly", async () => {
    const id = await createPass({ userId: max });
    for (const query of [
      "update public.form_passes set use_count = 0 where id = $1",
      "update public.form_passes set revoked_at = null where id = $1",
      "delete from public.form_passes where id = $1",
    ]) {
      await expect(
        queryAs(db, { userId: max }, query, [id]),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      queryAs(
        db,
        { userId: max },
        `insert into public.form_passes (form_id, token_hash, source)
         values ($1, $2, 'n8n')`,
        [form, OTHER_HASH],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("go with their form when it is deleted", async () => {
    await createPass({ userId: max });
    await commitAs(db, { userId: root }, "select public.delete_form($1)", [
      form,
    ]);
    const { rows } = await db.query(
      "select count(*)::int as n from public.form_passes",
    );
    expect(rows).toEqual([{ n: 0 }]);
  });
});

describe("revoking a form pass", () => {
  async function revokedAt(id: string): Promise<string | null> {
    const { rows } = await db.query<{ revoked_at: string | null }>(
      "select revoked_at from public.form_passes where id = $1",
      [id],
    );
    return rows[0].revoked_at;
  }

  it("can be done by members of the owning team, and is recorded", async () => {
    const id = await createPass({ userId: max });
    await commitAs(db, { userId: anna }, REVOKE, [id]);
    expect(await revokedAt(id)).not.toBeNull();
    expect((await passEntries()).at(-1)).toEqual({
      team_id: firstAid,
      actor_id: anna,
      action: "form_pass.revoked",
      entity_type: "form_pass",
      entity_id: id,
      details: { name: "Nachbefragung" },
    });
  });

  it("keeps the first revocation and records it once", async () => {
    const id = await createPass({ userId: max });
    await commitAs(db, { userId: max }, REVOKE, [id]);
    const first = await revokedAt(id);
    await commitAs(db, { userId: root }, REVOKE, [id]);
    expect(await revokedAt(id)).toEqual(first);
    expect(
      (await passEntries()).filter((e) => e.action === "form_pass.revoked"),
    ).toHaveLength(1);
  });

  it("is refused to members of other teams and to visitors", async () => {
    const id = await createPass({ userId: max });
    await expect(
      queryAs(db, { userId: bea }, REVOKE, [id]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(queryAs(db, "anon", REVOKE, [id])).rejects.toMatchObject({
      code: "42501",
    });
  });
});

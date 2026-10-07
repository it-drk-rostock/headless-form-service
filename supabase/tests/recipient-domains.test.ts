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
let root: string; // Super Admin, in no team
let max: string; // member of Erste Hilfe
let form: string; // Erste Hilfe's form

const READ_DOMAINS = "select allowed_recipient_domains from public.settings";
const UPDATE_DOMAINS =
  "update public.settings set allowed_recipient_domains = $1";
const SET_RECIPIENTS =
  "update public.forms set recipients = $2::text[] where id = $1 returning recipients::text[]";

beforeEach(async () => {
  db = await migratedDatabase();
  root = await createSuperAdmin(db, "root@drk-rostock.de");
  max = await createAuthUser(db, "max@drk-rostock.de");
  const firstAid = await createTeam(db, "Erste Hilfe");
  await addTeamMember(db, firstAid, max, "member");
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name) values ($1, 'Kursanmeldung') returning id",
    [firstAid],
  );
  form = rows[0].id;
});

async function auditActions(): Promise<string[]> {
  const { rows } = await db.query<{ action: string }>(
    "select action from public.audit_log where entity_type = 'settings' order by id",
  );
  return rows.map((row) => row.action);
}

describe("the allowed recipient domains setting", () => {
  it("starts with the DRK Rostock's own domain", async () => {
    expect(await queryAs(db, { userId: root }, READ_DOMAINS)).toEqual([
      { allowed_recipient_domains: ["drk-rostock.de"] },
    ]);
  });

  it("is changed by Super Admins, and audited", async () => {
    await commitAs(db, { userId: root }, UPDATE_DOMAINS, [
      ["drk-rostock.de", "kv.drk-rostock.de"],
    ]);

    expect(await commitAs(db, "service", READ_DOMAINS)).toEqual([
      { allowed_recipient_domains: ["drk-rostock.de", "kv.drk-rostock.de"] },
    ]);
    const { rows } = await db.query<{ details: unknown; actor_id: string }>(
      "select details, actor_id from public.audit_log where action = 'settings.recipient_domains_changed'",
    );
    expect(rows).toEqual([
      {
        actor_id: root,
        details: {
          from: ["drk-rostock.de"],
          to: ["drk-rostock.de", "kv.drk-rostock.de"],
        },
      },
    ]);
  });

  it("records nothing for a save that leaves it as it was", async () => {
    await commitAs(db, { userId: root }, UPDATE_DOMAINS, [["drk-rostock.de"]]);

    expect(await auditActions()).toEqual([]);
  });

  it("is neither seen nor changed by anyone else", async () => {
    expect(await queryAs(db, { userId: max }, READ_DOMAINS)).toEqual([]);
    expect(
      await queryAs(db, { userId: max }, `${UPDATE_DOMAINS} returning 1`, [
        ["gmail.com"],
      ]),
    ).toEqual([]);
  });

  it.each([
    ["upper case", "DRK-Rostock.de"],
    ["a whole address", "kurse@drk-rostock.de"],
    ["no dot", "localhost"],
    ["a wildcard", "*.drk-rostock.de"],
    ["an empty label", "drk-rostock..de"],
    ["an empty entry", ""],
  ])("refuses a domain with %s", async (_, domain) => {
    await expect(
      queryAs(db, { userId: root }, UPDATE_DOMAINS, [[domain]]),
    ).rejects.toThrow(/settings_allowed_recipient_domains_check/);
  });

  it("refuses more than 100 domains", async () => {
    const many = Array.from({ length: 101 }, (_, i) => `ov${i}.drk-rostock.de`);
    await expect(
      queryAs(db, { userId: root }, UPDATE_DOMAINS, [many]),
    ).rejects.toThrow(/settings_allowed_recipient_domains_check/);
  });
});

describe("a form's recipients", () => {
  it("may be on an allowed domain", async () => {
    expect(
      await queryAs(db, { userId: max }, SET_RECIPIENTS, [
        form,
        ["kurse@drk-rostock.de"],
      ]),
    ).toEqual([{ recipients: ["kurse@drk-rostock.de"] }]);
  });

  it.each([
    ["a private mailbox", "erika@gmail.com"],
    ["a subdomain that is not listed", "kurse@ov.drk-rostock.de"],
    ["a look-alike domain", "kurse@drk-rostock.de.example.com"],
  ])("may not be %s, naming the first refused address", async (_, address) => {
    await expect(
      queryAs(db, { userId: max }, SET_RECIPIENTS, [
        form,
        ["kurse@drk-rostock.de", address, "zweite@gmail.com"],
      ]),
    ).rejects.toMatchObject({ code: "HF006", detail: address });
  });

  it("are refused for Super Admins and the secret key too", async () => {
    await expect(
      queryAs(db, { userId: root }, SET_RECIPIENTS, [form, ["a@gmail.com"]]),
    ).rejects.toMatchObject({ code: "HF006" });
    await expect(
      commitAs(db, "service", SET_RECIPIENTS, [form, ["a@gmail.com"]]),
    ).rejects.toMatchObject({ code: "HF006" });
  });

  it("are refused on insert as well", async () => {
    await expect(
      db.query(
        "insert into public.forms (team_id, name, recipients) select team_id, 'X', '{a@gmail.com}' from public.forms where id = $1",
        [form],
      ),
    ).rejects.toMatchObject({ code: "HF006" });
  });

  it("are all refused when no domain is allowed", async () => {
    await commitAs(db, { userId: root }, UPDATE_DOMAINS, [[]]);
    await expect(
      queryAs(db, { userId: max }, SET_RECIPIENTS, [
        form,
        ["kurse@drk-rostock.de"],
      ]),
    ).rejects.toMatchObject({ code: "HF006" });
  });

  it("follow a newly allowed domain at once", async () => {
    await commitAs(db, { userId: root }, UPDATE_DOMAINS, [
      ["drk-rostock.de", "kv.drk-rostock.de"],
    ]);
    expect(
      await queryAs(db, { userId: max }, SET_RECIPIENTS, [
        form,
        ["leitung@kv.drk-rostock.de"],
      ]),
    ).toEqual([{ recipients: ["leitung@kv.drk-rostock.de"] }]);
  });

  it("stay saved when their domain is removed, and other settings can still be changed", async () => {
    await commitAs(db, { userId: max }, SET_RECIPIENTS, [
      form,
      ["kurse@drk-rostock.de"],
    ]);
    await commitAs(db, { userId: root }, UPDATE_DOMAINS, [
      ["kv.drk-rostock.de"],
    ]);

    // The dashboard saves the unchanged list along with the rest.
    expect(
      await queryAs(
        db,
        { userId: max },
        "update public.forms set name = 'Kurse', recipients = recipients where id = $1 returning name",
        [form],
      ),
    ).toEqual([{ name: "Kurse" }]);
    // A changed list must be entirely on allowed domains.
    await expect(
      queryAs(db, { userId: max }, SET_RECIPIENTS, [
        form,
        ["kurse@drk-rostock.de", "leitung@kv.drk-rostock.de"],
      ]),
    ).rejects.toMatchObject({ code: "HF006", detail: "kurse@drk-rostock.de" });
  });
});

describe("dispatch_submission", () => {
  it("serves the allowed domains as they are now", async () => {
    await db.query("update public.forms set draft_schema = $2 where id = $1", [
      form,
      { elements: [{ type: "text", name: "vorname" }] },
    ]);
    await commitAs(db, { userId: max }, "select public.publish_form($1)", [
      form,
    ]);
    await commitAs(db, { userId: root }, UPDATE_DOMAINS, [
      ["drk-rostock.de", "kv.drk-rostock.de"],
    ]);

    expect(
      await commitAs(
        db,
        "service",
        "select allowed_recipient_domains from public.dispatch_submission($1, $2, 1)",
        ["0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d", form],
      ),
    ).toEqual([
      { allowed_recipient_domains: ["drk-rostock.de", "kv.drk-rostock.de"] },
    ]);
  });
});

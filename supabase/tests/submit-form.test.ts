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
let max: string; // member of Erste Hilfe
let form: string; // Erste Hilfe's form

const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";
const UNKNOWN = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const questions = (name: string) => ({
  pages: [{ name: "seite1", elements: [{ type: "text", name }] }],
});

const FORM_VERSION = "select * from public.submission_form($1, $2)";
const QUEUE = "select public.queue_submission($1, $2, $3) as queued";
const UNQUEUE = "select public.unqueue_submission($1)";
const RECORD = "select public.record_queued_message($1, $2)";

beforeEach(async () => {
  db = await migratedDatabase();
  const firstAid = await createTeam(db, "Erste Hilfe");
  max = await createAuthUser(db, "max@drk-rostock.de");
  await addTeamMember(db, firstAid, max, "member");
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name, draft_schema) values ($1, 'Kursanmeldung', $2) returning id",
    [firstAid, questions("vorname")],
  );
  form = rows[0].id;
});

async function publish(schema: unknown): Promise<void> {
  await db.query("update public.forms set draft_schema = $2 where id = $1", [
    form,
    schema,
  ]);
  await commitAs(db, { userId: max }, "select public.publish_form($1)", [form]);
}

async function stats() {
  const { rows } = await db.query(
    "select id, form_id, version, status, qstash_message_id, submitted_at is not null as stamped from public.form_stats",
  );
  return rows;
}

describe("submission_form", () => {
  it("serves the questions and access type of the submitted version, older ones too", async () => {
    await publish(questions("vorname"));
    await publish(questions("nachname"));

    expect(await commitAs(db, "service", FORM_VERSION, [form, 1])).toEqual([
      {
        schema: questions("vorname"),
        access_type: "public",
        turnstile_enabled: true,
      },
    ]);
    expect(await commitAs(db, "service", FORM_VERSION, [form, 2])).toEqual([
      {
        schema: questions("nachname"),
        access_type: "public",
        turnstile_enabled: true,
      },
    ]);
  });

  it("serves the form's Turnstile setting as it is now", async () => {
    await publish(questions("vorname"));
    await db.query(
      "update public.forms set turnstile_enabled = false where id = $1",
      [form],
    );

    expect(await commitAs(db, "service", FORM_VERSION, [form, 1])).toEqual([
      expect.objectContaining({ turnstile_enabled: false }),
    ]);
  });

  it("serves nothing for an unknown version or form", async () => {
    await publish(questions("vorname"));

    expect(await commitAs(db, "service", FORM_VERSION, [form, 2])).toEqual([]);
    expect(await commitAs(db, "service", FORM_VERSION, [UNKNOWN, 1])).toEqual(
      [],
    );
  });

  it("serves nothing for an archived form", async () => {
    await publish(questions("vorname"));
    await db.query(
      "update public.forms set archived_at = now() where id = $1",
      [form],
    );

    expect(await commitAs(db, "service", FORM_VERSION, [form, 1])).toEqual([]);
  });
});

describe("queue_submission", () => {
  it("records the submission as queued under its ID, without any answers", async () => {
    await publish(questions("vorname"));

    expect(await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1])).toEqual(
      [{ queued: true }],
    );

    expect(await stats()).toEqual([
      {
        id: SUBMISSION,
        form_id: form,
        version: 1,
        status: "queued",
        qstash_message_id: null,
        stamped: true,
      },
    ]);
  });

  it("queues a submission ID only once QStash has taken it", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await commitAs(db, "service", RECORD, [SUBMISSION, "msg_123"]);

    expect(await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1])).toEqual(
      [{ queued: false }],
    );
    expect(await stats()).toHaveLength(1);
  });

  it("queues again while QStash has not confirmed taking it", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);

    expect(await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1])).toEqual(
      [{ queued: true }],
    );
    expect(await stats()).toHaveLength(1);
  });

  it("does not queue an ID already used for another form or version", async () => {
    await publish(questions("vorname"));
    await publish(questions("nachname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);

    expect(await commitAs(db, "service", QUEUE, [SUBMISSION, form, 2])).toEqual(
      [{ queued: false }],
    );
    expect(await stats()).toMatchObject([{ version: 1 }]);
  });

  it("refuses a version the form does not have", async () => {
    await publish(questions("vorname"));

    await expect(
      commitAs(db, "service", QUEUE, [SUBMISSION, form, 2]),
    ).rejects.toMatchObject({ code: "23503" });
  });
});

describe("unqueue_submission", () => {
  it("removes a queued submission's row", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);

    await commitAs(db, "service", UNQUEUE, [SUBMISSION]);

    expect(await stats()).toEqual([]);
  });

  it("leaves a submission that is no longer queued", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await db.query("update public.form_stats set status = 'sent'");

    await commitAs(db, "service", UNQUEUE, [SUBMISSION]);

    expect(await stats()).toHaveLength(1);
  });
});

describe("record_queued_message", () => {
  it("keeps QStash's message ID with the submission", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);

    await commitAs(db, "service", RECORD, [SUBMISSION, "msg_123"]);

    expect(await stats()).toMatchObject([{ qstash_message_id: "msg_123" }]);
  });
});

describe("form_stats access", () => {
  it("gives visitors and signed-in people none of the functions", async () => {
    await publish(questions("vorname"));

    for (const who of ["anon", { userId: max }] as const) {
      for (const [query, params] of [
        [FORM_VERSION, [form, 1]],
        [QUEUE, [SUBMISSION, form, 1]],
        [UNQUEUE, [SUBMISSION]],
        [RECORD, [SUBMISSION, "msg_123"]],
      ] as const) {
        await expect(
          queryAs(db, who, query, [...params]),
        ).rejects.toMatchObject({ code: "42501" });
      }
    }
  });

  it("cannot be read or written directly, not even with the secret key", async () => {
    for (const who of ["anon", { userId: max }] as const) {
      await expect(
        queryAs(db, who, "select * from public.form_stats"),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      commitAs(db, "service", "select * from public.form_stats"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

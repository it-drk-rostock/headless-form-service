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
let anna: string; // Team Admin of Erste Hilfe
let max: string; // member of Erste Hilfe
let bea: string; // member of Blutspende
let firstAid: string;
let form: string; // Erste Hilfe's form

const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";
const OTHER_SUBMISSION = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const MESSAGE = "msg_original";
const RETRIED_MESSAGE = "msg_retried";

const QUEUE = "select public.queue_submission($1, $2, $3)";
const RECORD_MESSAGE = "select public.record_queued_message($1, $2)";
const RECORD_FAILURE =
  "select * from public.record_delivery_failure($1, $2, $3)";
const MARK_SENT = "select public.mark_submission_sent($1)";
const RETRY_MESSAGE = "select public.delivery_retry_message($1) as message";
const RECORD_RETRY = "select public.record_delivery_retry($1, $2)";
const RECORD_GONE = "select public.record_delivery_retry_gone($1, $2)";
const FAILURES = `select id, version, status, failure_reason, failed_at, retried_at, dlq_gone_at
  from public.form_stats where form_id = $1 order by id`;

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
    `insert into public.forms (team_id, name, recipients, draft_schema)
     values ($1, 'Kursanmeldung', $2::text[], $3) returning id`,
    [
      firstAid,
      ["kurse@drk-rostock.de"],
      { pages: [{ name: "seite1", elements: [{ type: "text", name: "a" }] }] },
    ],
  );
  form = rows[0].id;
  await commitAs(db, { userId: max }, "select public.publish_form($1)", [form]);
  for (const id of [SUBMISSION, OTHER_SUBMISSION]) {
    await commitAs(db, "service", QUEUE, [id, form, 1]);
    await commitAs(db, "service", RECORD_MESSAGE, [id, MESSAGE]);
  }
});

async function fail(id = SUBMISSION, reason = "mail_failed (HTTP 502)") {
  await commitAs(db, "service", RECORD_FAILURE, [id, form, reason]);
}

async function row(id = SUBMISSION) {
  const { rows } = await db.query<Record<string, unknown>>(
    `select status, failure_reason, qstash_message_id, failed_at, retried_at, dlq_gone_at
     from public.form_stats where id = $1`,
    [id],
  );
  return rows[0];
}

async function retryEntries(action = "delivery.retried") {
  const { rows } = await db.query(
    `select team_id, actor_id, action, entity_type, entity_id, details
     from public.audit_log where action = $1 order by id`,
    [action],
  );
  return rows;
}

describe("the failure list", () => {
  it("shows members of the form's team its submissions with their delivery metadata", async () => {
    await fail();
    const rows = await queryAs<Record<string, unknown>>(
      db,
      { userId: max },
      FAILURES,
      [form],
    );
    expect(rows).toEqual([
      {
        id: SUBMISSION,
        version: 1,
        status: "failed",
        failure_reason: "mail_failed (HTTP 502)",
        failed_at: expect.any(Date),
        retried_at: null,
        dlq_gone_at: null,
      },
      {
        id: OTHER_SUBMISSION,
        version: 1,
        status: "queued",
        failure_reason: null,
        failed_at: null,
        retried_at: null,
        dlq_gone_at: null,
      },
    ]);
  });

  it("is shown to Super Admins, but not to other teams' members", async () => {
    await fail();
    expect(await queryAs(db, { userId: root }, FAILURES, [form])).toHaveLength(
      2,
    );
    expect(await queryAs(db, { userId: bea }, FAILURES, [form])).toEqual([]);
    await expect(queryAs(db, "anon", FAILURES, [form])).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("never shows QStash's message ID, nor lets anyone write rows", async () => {
    await expect(
      queryAs(
        db,
        { userId: max },
        "select qstash_message_id from public.form_stats",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      queryAs(
        db,
        { userId: max },
        "update public.form_stats set status = 'sent'",
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("records when a submission failed, the newest failure winning", async () => {
    await fail();
    const first = (await row()).failed_at as Date;
    await db.query(
      "update public.form_stats set failed_at = failed_at - interval '1 day'",
    );
    await fail(SUBMISSION, "HTTP 500");
    expect(((await row()).failed_at as Date).getTime()).toBeGreaterThanOrEqual(
      first.getTime(),
    );
  });
});

describe("retrying a delivery", () => {
  it("hands members of the form's team the failed message's ID", async () => {
    await fail();
    for (const who of [max, anna, root]) {
      expect(
        await queryAs(db, { userId: who }, RETRY_MESSAGE, [SUBMISSION]),
      ).toEqual([{ message: MESSAGE }]);
    }
  });

  it("is refused to other teams' members and to visitors", async () => {
    await fail();
    for (const [query, params] of [
      [RETRY_MESSAGE, [SUBMISSION]],
      [RECORD_RETRY, [SUBMISSION, RETRIED_MESSAGE]],
      [RECORD_GONE, [SUBMISSION, MESSAGE]],
    ] as const) {
      await expect(
        queryAs(db, { userId: bea }, query, [...params]),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        queryAs(db, "anon", query, [...params]),
      ).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("is refused for a submission that is not failed, or unknown", async () => {
    await expect(
      queryAs(db, { userId: max }, RETRY_MESSAGE, [SUBMISSION]),
    ).rejects.toMatchObject({ code: "HF011" });
    await fail();
    await commitAs(db, "service", MARK_SENT, [SUBMISSION]);
    await expect(
      queryAs(db, { userId: max }, RETRY_MESSAGE, [SUBMISSION]),
    ).rejects.toMatchObject({ code: "HF011" });
    await expect(
      queryAs(db, { userId: root }, RETRY_MESSAGE, [crypto.randomUUID()]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("puts the submission back to queued under QStash's new message", async () => {
    await fail();
    await commitAs(db, { userId: max }, RECORD_RETRY, [
      SUBMISSION,
      RETRIED_MESSAGE,
    ]);
    expect(await row()).toMatchObject({
      status: "queued",
      // Kept, so the list still says why it failed while it is retried.
      failure_reason: "mail_failed (HTTP 502)",
      qstash_message_id: RETRIED_MESSAGE,
      retried_at: expect.any(Date),
      dlq_gone_at: null,
    });
    expect((await row(OTHER_SUBMISSION)).status).toBe("queued");
    expect((await row(OTHER_SUBMISSION)).retried_at).toBeNull();
  });

  it("is sent like any submission afterwards, or fails again", async () => {
    await fail();
    await commitAs(db, { userId: max }, RECORD_RETRY, [
      SUBMISSION,
      RETRIED_MESSAGE,
    ]);
    await fail(SUBMISSION, "HTTP 500");
    expect(await row()).toMatchObject({
      status: "failed",
      failure_reason: "HTTP 500",
      qstash_message_id: RETRIED_MESSAGE,
    });
    // ...and can be retried again, now under the new message.
    expect(
      await queryAs(db, { userId: max }, RETRY_MESSAGE, [SUBMISSION]),
    ).toEqual([{ message: RETRIED_MESSAGE }]);

    await commitAs(db, "service", MARK_SENT, [SUBMISSION]);
    expect(await row()).toMatchObject({ status: "sent", failure_reason: null });
  });

  it("records each retry in the audit log, without submission data", async () => {
    await fail();
    await commitAs(db, { userId: max }, RECORD_RETRY, [
      SUBMISSION,
      RETRIED_MESSAGE,
    ]);
    expect(await retryEntries()).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "delivery.retried",
        entity_type: "submission",
        entity_id: SUBMISSION,
        details: {
          name: "Kursanmeldung",
          version: 1,
          submitted_at: expect.any(String),
        },
      },
    ]);
  });

  it("still records a retry whose message was delivered before it was recorded", async () => {
    await fail();
    await commitAs(db, "service", MARK_SENT, [SUBMISSION]);
    await commitAs(db, { userId: max }, RECORD_RETRY, [
      SUBMISSION,
      RETRIED_MESSAGE,
    ]);
    expect(await row()).toMatchObject({ status: "sent" });
    expect(await retryEntries()).toHaveLength(1);
  });
});

describe("a retry whose DLQ message is gone", () => {
  it("marks the submission as no longer retryable", async () => {
    await fail();
    await commitAs(db, { userId: max }, RECORD_GONE, [SUBMISSION, MESSAGE]);
    expect(await row()).toMatchObject({
      status: "failed",
      dlq_gone_at: expect.any(Date),
    });
    await expect(
      queryAs(db, { userId: max }, RETRY_MESSAGE, [SUBMISSION]),
    ).rejects.toMatchObject({ code: "HF011" });
    expect(await retryEntries()).toEqual([]);
  });

  it("records in the audit log who found it gone", async () => {
    await fail();
    await commitAs(db, { userId: max }, RECORD_GONE, [SUBMISSION, MESSAGE]);
    await commitAs(db, { userId: max }, RECORD_GONE, [SUBMISSION, MESSAGE]);
    expect(await retryEntries("delivery.retry_unavailable")).toEqual([
      {
        team_id: firstAid,
        actor_id: max,
        action: "delivery.retry_unavailable",
        entity_type: "submission",
        entity_id: SUBMISSION,
        details: {
          name: "Kursanmeldung",
          version: 1,
          submitted_at: expect.any(String),
        },
      },
    ]);
  });

  it("leaves a submission alone that someone else retried meanwhile", async () => {
    await fail();
    await commitAs(db, { userId: anna }, RECORD_RETRY, [
      SUBMISSION,
      RETRIED_MESSAGE,
    ]);
    await commitAs(db, { userId: max }, RECORD_GONE, [SUBMISSION, MESSAGE]);
    expect(await row()).toMatchObject({ status: "queued", dlq_gone_at: null });
    expect(await retryEntries("delivery.retry_unavailable")).toEqual([]);
  });

  it("is cleared by a retry recorded after it", async () => {
    await fail();
    await commitAs(db, { userId: max }, RECORD_GONE, [SUBMISSION, MESSAGE]);
    await commitAs(db, { userId: anna }, RECORD_RETRY, [
      SUBMISSION,
      RETRIED_MESSAGE,
    ]);
    expect(await row()).toMatchObject({ status: "queued", dlq_gone_at: null });
  });
});

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
let firstAid: string;
let form: string; // Erste Hilfe's form

const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";
const OTHER_SUBMISSION = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const questions = (name: string) => ({
  pages: [{ name: "seite1", elements: [{ type: "text", name }] }],
});

const DISPATCH = "select * from public.dispatch_submission($1, $2, $3)";
const MARK_SENT = "select public.mark_submission_sent($1)";
const QUEUE = "select public.queue_submission($1, $2, $3)";
const RECORD_FAILURE =
  "select * from public.record_delivery_failure($1, $2, $3)";

beforeEach(async () => {
  db = await migratedDatabase();
  firstAid = await createTeam(db, "Erste Hilfe");
  max = await createAuthUser(db, "max@drk-rostock.de");
  await addTeamMember(db, firstAid, max, "member");
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name, recipients, draft_schema) values ($1, 'Kursanmeldung', $2::text[], $3) returning id",
    [firstAid, ["kurse@drk-rostock.de"], questions("vorname")],
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

async function status(id = SUBMISSION) {
  const { rows } = await db.query<{ status: string }>(
    "select status from public.form_stats where id = $1",
    [id],
  );
  return rows[0]?.status;
}

describe("dispatch_submission", () => {
  it("serves the form's name and recipients and the submitted version's questions and template", async () => {
    await publish(questions("vorname"));
    await publish(questions("nachname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    // Recipients take effect at once, also for submissions already queued.
    await db.query(
      "update public.forms set recipients = $2::text[], name = 'Kurse' where id = $1",
      [form, ["leitung@drk-rostock.de", "kurse@drk-rostock.de"]],
    );

    const rows = await commitAs<Record<string, unknown>>(
      db,
      "service",
      DISPATCH,
      [SUBMISSION, form, 1],
    );

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      form_name: "Kurse",
      recipients: ["leitung@drk-rostock.de", "kurse@drk-rostock.de"],
      schema: questions("vorname"),
      email_template: {
        mode: "standard",
        subject: "Neue Einsendung: {{form.name}}",
      },
      status: "queued",
    });
    expect(row.submitted_at).toBeInstanceOf(Date);
  });

  it("serves the form's sender name and Reply-To question as they are now", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    expect(
      await commitAs(db, "service", DISPATCH, [SUBMISSION, form, 1]),
    ).toMatchObject([{ sender_display_name: "", reply_to_question: null }]);

    await db.query(
      "update public.forms set sender_display_name = 'DRK Kurse', reply_to_question = 'email' where id = $1",
      [form],
    );

    expect(
      await commitAs(db, "service", DISPATCH, [SUBMISSION, form, 1]),
    ).toMatchObject([
      { sender_display_name: "DRK Kurse", reply_to_question: "email" },
    ]);
  });

  it("serves a submission whose stats row is gone, with no status", async () => {
    await publish(questions("vorname"));

    const rows = await commitAs<Record<string, unknown>>(
      db,
      "service",
      DISPATCH,
      [SUBMISSION, form, 1],
    );

    expect(rows).toMatchObject([{ form_name: "Kursanmeldung", status: null }]);
    expect(rows[0].submitted_at).toBeInstanceOf(Date);
  });

  it("serves an archived form, which accepted the submission before", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await db.query(
      "update public.forms set archived_at = now() where id = $1",
      [form],
    );

    expect(
      await commitAs(db, "service", DISPATCH, [SUBMISSION, form, 1]),
    ).toMatchObject([{ status: "queued" }]);
  });

  it("serves nothing for a version the form does not have", async () => {
    await publish(questions("vorname"));

    expect(
      await commitAs(db, "service", DISPATCH, [SUBMISSION, form, 2]),
    ).toEqual([]);
  });
});

describe("mark_submission_sent", () => {
  it("marks the submission sent, and only that one", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await commitAs(db, "service", QUEUE, [OTHER_SUBMISSION, form, 1]);

    await commitAs(db, "service", MARK_SENT, [SUBMISSION]);

    expect(await status()).toBe("sent");
    expect(await status(OTHER_SUBMISSION)).toBe("queued");
  });

  it("clears the failure reason of a failed submission delivered after all", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await db.query(
      "update public.form_stats set status = 'failed', failure_reason = 'mailjet 503'",
    );

    await commitAs(db, "service", MARK_SENT, [SUBMISSION]);

    const { rows } = await db.query(
      "select status, failure_reason from public.form_stats",
    );
    expect(rows).toEqual([{ status: "sent", failure_reason: null }]);
  });

  it("does nothing for a submission without a stats row", async () => {
    await commitAs(db, "service", MARK_SENT, [SUBMISSION]);

    expect(await status()).toBeUndefined();
  });
});

describe("record_delivery_failure", () => {
  beforeEach(async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    const ben = await createAuthUser(db, "ben@drk-rostock.de");
    await addTeamMember(db, firstAid, anna, "team_admin");
    await addTeamMember(db, firstAid, ben, "team_admin");
    // Team Admin of another team only.
    const other = await createTeam(db, "Blutspende");
    const carla = await createAuthUser(db, "carla@drk-rostock.de");
    await addTeamMember(db, other, carla, "team_admin");
  });

  it("marks the submission failed with the reason, and only that one", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await commitAs(db, "service", QUEUE, [OTHER_SUBMISSION, form, 1]);

    await commitAs(db, "service", RECORD_FAILURE, [
      SUBMISSION,
      form,
      "mail_failed (HTTP 502)",
    ]);

    const { rows } = await db.query(
      "select id, status, failure_reason from public.form_stats order by id",
    );
    expect(rows).toEqual([
      {
        id: SUBMISSION,
        status: "failed",
        failure_reason: "mail_failed (HTTP 502)",
      },
      { id: OTHER_SUBMISSION, status: "queued", failure_reason: null },
    ]);
  });

  it("returns the form and team names, the Team Admins' addresses and the submission time", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);

    const rows = await commitAs<Record<string, unknown>>(
      db,
      "service",
      RECORD_FAILURE,
      [SUBMISSION, form, "HTTP 500"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      form_name: "Kursanmeldung",
      team_name: "Erste Hilfe",
      team_admins: ["anna@drk-rostock.de", "ben@drk-rostock.de"],
      status: "failed",
    });
    expect(rows[0].submitted_at).toBeInstanceOf(Date);
  });

  it("leaves a submission that was sent after all as it is", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await commitAs(db, "service", MARK_SENT, [SUBMISSION]);

    const rows = await commitAs(db, "service", RECORD_FAILURE, [
      SUBMISSION,
      form,
      "HTTP 500",
    ]);

    expect(rows).toMatchObject([{ status: "sent" }]);
    const { rows: stats } = await db.query(
      "select status, failure_reason from public.form_stats",
    );
    expect(stats).toEqual([{ status: "sent", failure_reason: null }]);
  });

  it("records a repeated failure again with the newest reason", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await commitAs(db, "service", RECORD_FAILURE, [
      SUBMISSION,
      form,
      "HTTP 500",
    ]);

    const rows = await commitAs(db, "service", RECORD_FAILURE, [
      SUBMISSION,
      form,
      "mail_failed (HTTP 502)",
    ]);

    expect(rows).toMatchObject([{ status: "failed" }]);
    const { rows: stats } = await db.query(
      "select failure_reason from public.form_stats",
    );
    expect(stats).toEqual([{ failure_reason: "mail_failed (HTTP 502)" }]);
  });

  it("still names whom to alert when the stats row is gone", async () => {
    await publish(questions("vorname"));

    const rows = await commitAs(db, "service", RECORD_FAILURE, [
      SUBMISSION,
      form,
      "HTTP 500",
    ]);

    expect(rows).toMatchObject([
      { form_name: "Kursanmeldung", submitted_at: null, status: null },
    ]);
  });

  it("does not touch another form's submission with that ID", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    const { rows } = await db.query<{ id: string }>(
      "insert into public.forms (team_id, name) values ($1, 'Andere') returning id",
      [firstAid],
    );

    await commitAs(db, "service", RECORD_FAILURE, [
      SUBMISSION,
      rows[0].id,
      "HTTP 500",
    ]);

    expect(await status()).toBe("queued");
  });

  it("serves an archived form", async () => {
    await publish(questions("vorname"));
    await commitAs(db, "service", QUEUE, [SUBMISSION, form, 1]);
    await db.query(
      "update public.forms set archived_at = now() where id = $1",
      [form],
    );

    expect(
      await commitAs(db, "service", RECORD_FAILURE, [
        SUBMISSION,
        form,
        "HTTP 500",
      ]),
    ).toMatchObject([{ status: "failed" }]);
  });

  it("returns nothing for a form that is gone", async () => {
    expect(
      await commitAs(db, "service", RECORD_FAILURE, [
        SUBMISSION,
        OTHER_SUBMISSION,
        "HTTP 500",
      ]),
    ).toEqual([]);
  });
});

describe("dispatch access", () => {
  it("gives visitors and signed-in people none of the functions", async () => {
    await publish(questions("vorname"));

    for (const who of ["anon", { userId: max }] as const) {
      for (const [query, params] of [
        [DISPATCH, [SUBMISSION, form, 1]],
        [MARK_SENT, [SUBMISSION]],
        [RECORD_FAILURE, [SUBMISSION, form, "HTTP 500"]],
      ] as const) {
        await expect(
          queryAs(db, who, query, [...params]),
        ).rejects.toMatchObject({ code: "42501" });
      }
    }
  });
});

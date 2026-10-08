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
let member: string;
let form: string;

const HASH = "a".repeat(64);
const SUBMISSION = "0b9c2f4e-6a1d-4e8b-9f3c-5d7e1a2b4c6d";
const CLAIM = "select * from public.claim_form_pass($1, $2, gen_random_uuid())";
const BOUND_CLAIM = "select * from public.claim_form_pass($1, $2, $3)";
const RELEASE = "select public.finish_form_pass_claim($1, false)";
const FINISH = "select public.finish_form_pass_claim($1, $2)";

beforeEach(async () => {
  db = await migratedDatabase();
  const team = await createTeam(db, "Erste Hilfe");
  member = await createAuthUser(db, "max@drk-rostock.de");
  await addTeamMember(db, team, member);
  const { rows } = await db.query<{ id: string }>(
    "insert into public.forms (team_id, name, access_type) values ($1, 'Nachbefragung', 'protected') returning id",
    [team],
  );
  form = rows[0].id;
});

afterEach(async () => {
  await db.close();
});

async function createPass(maxUses: number | null = 1): Promise<string> {
  const rows = await commitAs<{ id: string }>(
    db,
    { userId: member },
    "select public.create_form_pass($1, $2, $3, null, $4) as id",
    [form, HASH, maxUses, JSON.stringify({ ticket: "T-17" })],
  );
  return rows[0].id;
}

describe("claim_form_pass", () => {
  it("binds one use to a submission across overlapping attempts", async () => {
    const id = await createPass();
    const submission = crypto.randomUUID();
    const claim = "select * from public.claim_form_pass($1, $2, $3)";

    expect(
      await commitAs(db, "service", claim, [form, HASH, submission]),
    ).toEqual([{ id, metadata: { ticket: "T-17" } }]);
    expect(
      await commitAs(db, "service", claim, [form, HASH, submission]),
    ).toEqual([{ id, metadata: { ticket: "T-17" } }]);
  });

  it("claims a single-use pass only once and returns its ID and metadata", async () => {
    const id = await createPass();

    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([
      { id, metadata: { ticket: "T-17" } },
    ]);
    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
  });

  it("gives only one competing claim the single available use", async () => {
    const id = await createPass();

    const results = await Promise.all([
      commitAs(db, "service", CLAIM, [form, HASH]),
      commitAs(db, "service", CLAIM, [form, HASH]),
    ]);

    expect(results.flat()).toEqual([{ id, metadata: { ticket: "T-17" } }]);
  });

  it("claims all available finite uses, then refuses another", async () => {
    const id = await createPass(2);

    for (let use = 0; use < 2; use++) {
      expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([
        { id, metadata: { ticket: "T-17" } },
      ]);
    }
    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
  });

  it("keeps unlimited passes usable after repeated claims", async () => {
    const id = await createPass(null);

    for (let use = 0; use < 3; use++) {
      expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([
        { id, metadata: { ticket: "T-17" } },
      ]);
    }
  });

  it.each([
    "wrong-form",
    "unknown-hash",
  ])("refuses a %s without consuming the pass", async (invalid) => {
    const id = await createPass();
    const wrongForm = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

    expect(
      await commitAs(db, "service", CLAIM, [
        invalid === "wrong-form" ? wrongForm : form,
        invalid === "unknown-hash" ? "b".repeat(64) : HASH,
      ]),
    ).toEqual([]);
    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([
      { id, metadata: { ticket: "T-17" } },
    ]);
  });

  it("refuses a revoked pass", async () => {
    const id = await createPass();
    await commitAs(
      db,
      { userId: member },
      "select public.revoke_form_pass($1)",
      [id],
    );

    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
  });

  it("refuses an expired pass", async () => {
    const id = await createPass();
    await db.query(
      "update public.form_passes set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1",
      [id],
    );

    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
  });

  it("claims a pass whose expiry is still in the future", async () => {
    const id = await createPass();
    await db.query(
      "update public.form_passes set expires_at = now() + interval '1 hour' where id = $1",
      [id],
    );

    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([
      { id, metadata: { ticket: "T-17" } },
    ]);
  });
});

describe("finish_form_pass_claim", () => {
  it("makes a failed submission's reserved use available again", async () => {
    const id = await createPass();
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);

    await commitAs(db, "service", RELEASE, [SUBMISSION]);

    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([
      { id, metadata: { ticket: "T-17" } },
    ]);
  });

  it("never releases a use below zero", async () => {
    await createPass();
    await commitAs(db, "service", RELEASE, [SUBMISSION]);
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);
    await commitAs(db, "service", RELEASE, [SUBMISSION]);
    await commitAs(db, "service", RELEASE, [SUBMISSION]);

    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toHaveLength(1);
    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
  });

  it("does not restore a revoked pass's validity", async () => {
    const id = await createPass();
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);
    await commitAs(
      db,
      { userId: member },
      "select public.revoke_form_pass($1)",
      [id],
    );

    await commitAs(db, "service", RELEASE, [SUBMISSION]);

    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
  });

  it("keeps one use when an overlapping attempt succeeded and another failed", async () => {
    await createPass(2);
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);

    await commitAs(db, "service", FINISH, [SUBMISSION, true]);
    await commitAs(db, "service", RELEASE, [SUBMISSION]);

    expect(
      await queryAs(
        db,
        { userId: member },
        "select use_count from public.form_passes",
      ),
    ).toEqual([{ use_count: 1 }]);
    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toHaveLength(1);
    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
  });

  it("keeps the reservation while another attempt is still publishing", async () => {
    await createPass();
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);

    await commitAs(db, "service", RELEASE, [SUBMISSION]);

    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
    await commitAs(db, "service", RELEASE, [SUBMISSION]);
    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toHaveLength(1);
  });

  it("reuses an accepted reservation without consuming a second use", async () => {
    const id = await createPass();
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);
    await commitAs(db, "service", FINISH, [SUBMISSION, true]);

    expect(
      await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]),
    ).toEqual([{ id, metadata: { ticket: "T-17" } }]);
    await commitAs(db, "service", RELEASE, [SUBMISSION]);
    expect(
      await queryAs(
        db,
        { userId: member },
        "select use_count from public.form_passes",
      ),
    ).toEqual([{ use_count: 1 }]);
    expect(await commitAs(db, "service", CLAIM, [form, HASH])).toEqual([]);
  });
});

describe("pass claim permissions", () => {
  it("refuses visitors and signed-in members both claim and release", async () => {
    const id = await createPass();

    for (const who of ["anon", { userId: member }] as const) {
      for (const [query, params] of [
        [CLAIM, [form, HASH]],
        [RELEASE, [id]],
      ] as const) {
        await expect(
          queryAs(db, who, query, [...params]),
        ).rejects.toMatchObject({
          code: "42501",
        });
      }
    }
  });

  it("keeps reservation rows private even from the service role", async () => {
    await createPass();
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);
    for (const who of ["anon", { userId: member }] as const) {
      await expect(
        queryAs(db, who, "select * from private.form_pass_claims"),
      ).rejects.toMatchObject({ code: "42501" });
    }
    await expect(
      commitAs(db, "service", "select * from private.form_pass_claims"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("protected submission cleanup", () => {
  async function queueSubmission() {
    await createPass();
    await db.query("update public.forms set draft_schema = $2 where id = $1", [
      form,
      { pages: [{ elements: [{ type: "text", name: "vorname" }] }] },
    ]);
    await commitAs(db, { userId: member }, "select public.publish_form($1)", [
      form,
    ]);
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);
    await commitAs(db, "service", "select public.queue_submission($1, $2, 1)", [
      SUBMISSION,
      form,
    ]);
  }

  async function statsCount() {
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.form_stats",
    );
    return rows[0].n;
  }

  it("keeps the stats row while another attempt is in flight or accepted", async () => {
    await queueSubmission();
    await commitAs(db, "service", BOUND_CLAIM, [form, HASH, SUBMISSION]);

    await commitAs(db, "service", RELEASE, [SUBMISSION]);
    await commitAs(db, "service", "select public.unqueue_submission($1)", [
      SUBMISSION,
    ]);
    expect(await statsCount()).toBe(1);
    await commitAs(db, "service", FINISH, [SUBMISSION, true]);
    await commitAs(db, "service", "select public.unqueue_submission($1)", [
      SUBMISSION,
    ]);
    expect(await statsCount()).toBe(1);
  });

  it("removes the stats row when every publishing attempt failed", async () => {
    await queueSubmission();
    await commitAs(db, "service", RELEASE, [SUBMISSION]);

    await commitAs(db, "service", "select public.unqueue_submission($1)", [
      SUBMISSION,
    ]);

    expect(await statsCount()).toBe(0);
  });
});

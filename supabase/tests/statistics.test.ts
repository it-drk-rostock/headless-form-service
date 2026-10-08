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
let bea: string; // member of Blutspende
let form: string; // Erste Hilfe's form, published twice

const STATISTICS = "select public.form_statistics($1, $2) as stats";

type Statistics = {
  by: "hour" | "day";
  from: string;
  to: string;
  series: {
    at: string;
    submissions: number;
    sent: number;
    failed: number;
    loads: number | null;
  }[];
  totals: {
    submissions: number;
    queued: number;
    sent: number;
    failed: number;
    loads: number;
  };
  versions: { version: number; submissions: number }[];
};

beforeEach(async () => {
  db = await migratedDatabase();
  const firstAid = await createTeam(db, "Erste Hilfe");
  const bloodDrive = await createTeam(db, "Blutspende");
  root = await createSuperAdmin(db, "root@drk-rostock.de");
  max = await createAuthUser(db, "max@drk-rostock.de");
  bea = await createAuthUser(db, "bea@drk-rostock.de");
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
  await commitAs(db, { userId: max }, "select public.publish_form($1)", [form]);
});

/** Berlin's date `daysAgo` days before today, as `YYYY-MM-DD`. */
async function berlinDay(daysAgo = 0): Promise<string> {
  const { rows } = await db.query<{ day: string }>(
    `select to_char((now() at time zone 'Europe/Berlin')::date - $1::int, 'YYYY-MM-DD') as day`,
    [daysAgo],
  );
  return rows[0].day;
}

async function submission(
  status: "queued" | "sent" | "failed",
  { version = 2, daysAgo = 0 }: { version?: number; daysAgo?: number } = {},
) {
  // Noon in Berlin, `daysAgo` days back, so no test runs over midnight.
  await db.query(
    `insert into public.form_stats (id, form_id, version, status, submitted_at)
     values (gen_random_uuid(), $1, $2, $3,
       case when $4::int = 0 then now()
            else (((now() at time zone 'Europe/Berlin')::date - $4::int) + time '12:00')
                 at time zone 'Europe/Berlin' end)`,
    [form, version, status, daysAgo],
  );
}

async function loads(count: number, daysAgo = 0) {
  await db.query(
    `insert into public.form_load_counts (form_id, day, count)
     values ($1, (now() at time zone 'Europe/Berlin')::date - $2::int, $3)`,
    [form, daysAgo, count],
  );
}

async function statistics(
  who: { userId: string },
  days: number,
): Promise<Statistics | null> {
  const [row] = await queryAs<{ stats: Statistics | null }>(
    db,
    who,
    STATISTICS,
    [form, days],
  );
  return row.stats;
}

describe("form statistics by day", () => {
  it("counts submissions, deliveries and loads per Berlin day, oldest first", async () => {
    await submission("sent", { daysAgo: 6 });
    await submission("sent", { daysAgo: 2 });
    await submission("failed", { daysAgo: 2 });
    await submission("queued");
    await submission("sent", { daysAgo: 7 }); // before the period
    await loads(10, 6);
    await loads(4, 2);
    await loads(3, 7);

    const stats = await statistics({ userId: max }, 7);

    expect(stats?.by).toBe("day");
    expect(stats?.from).toBe(await berlinDay(6));
    expect(stats?.to).toBe(await berlinDay(0));
    expect(stats?.series).toHaveLength(7);
    expect(stats?.series[0]).toEqual({
      at: await berlinDay(6),
      submissions: 1,
      sent: 1,
      failed: 0,
      loads: 10,
    });
    expect(stats?.series[4]).toEqual({
      at: await berlinDay(2),
      submissions: 2,
      sent: 1,
      failed: 1,
      loads: 4,
    });
    expect(stats?.series[5]).toEqual({
      at: await berlinDay(1),
      submissions: 0,
      sent: 0,
      failed: 0,
      loads: 0,
    });
    expect(stats?.series[6]).toMatchObject({ submissions: 1, sent: 0 });
  });

  it("totals the period: submissions by delivery status and loads", async () => {
    await submission("sent", { daysAgo: 1 });
    await submission("sent");
    await submission("failed");
    await submission("queued");
    await submission("failed", { daysAgo: 30 }); // before the period
    await loads(8);
    await loads(50, 30);

    expect((await statistics({ userId: max }, 7))?.totals).toEqual({
      submissions: 4,
      queued: 1,
      sent: 2,
      failed: 1,
      loads: 8,
    });
  });

  it("counts the period's submissions per form version, newest version first", async () => {
    await submission("sent", { version: 1, daysAgo: 3 });
    await submission("sent", { version: 2 });
    await submission("failed", { version: 2 });
    await submission("sent", { version: 1, daysAgo: 20 }); // before the period

    expect((await statistics({ userId: max }, 7))?.versions).toEqual([
      { version: 2, submissions: 2 },
      { version: 1, submissions: 1 },
    ]);
  });

  it("has a row for every day of a long period, even without data", async () => {
    const stats = await statistics({ userId: max }, 90);
    expect(stats?.series).toHaveLength(90);
    expect(stats?.from).toBe(await berlinDay(89));
    expect(stats?.totals).toEqual({
      submissions: 0,
      queued: 0,
      sent: 0,
      failed: 0,
      loads: 0,
    });
    expect(stats?.versions).toEqual([]);
  });
});

describe("form statistics of today by hour", () => {
  it("counts today's submissions per Berlin hour, with today's loads in the totals", async () => {
    await submission("sent");
    await submission("failed");
    await submission("sent", { daysAgo: 1 }); // yesterday
    await loads(5);
    await loads(9, 1);
    const { rows } = await db.query<{ hour: string }>(
      `select to_char(now() at time zone 'Europe/Berlin', 'YYYY-MM-DD"T"HH24:00') as hour`,
    );

    const stats = await statistics({ userId: max }, 1);

    expect(stats?.by).toBe("hour");
    expect(stats?.from).toBe(await berlinDay(0));
    expect(stats?.to).toBe(await berlinDay(0));
    expect(stats?.series).toHaveLength(24);
    expect(stats?.series[0].at).toBe(`${await berlinDay(0)}T00:00`);
    expect(stats?.series.find((point) => point.at === rows[0].hour)).toEqual({
      at: rows[0].hour,
      submissions: 2,
      sent: 1,
      failed: 1,
      loads: null,
    });
    expect(stats?.totals).toEqual({
      submissions: 2,
      queued: 0,
      sent: 1,
      failed: 1,
      loads: 5,
    });
  });
});

describe("who sees form statistics", () => {
  beforeEach(async () => {
    await submission("sent");
    await loads(3);
  });

  it("shows Super Admins every form's statistics", async () => {
    expect((await statistics({ userId: root }, 7))?.totals).toMatchObject({
      submissions: 1,
      loads: 3,
    });
  });

  it("shows other teams' members nothing", async () => {
    expect(await statistics({ userId: bea }, 7)).toBeNull();
  });

  it("lets other teams' members read no load counts directly", async () => {
    expect(
      await queryAs(
        db,
        { userId: bea },
        "select * from public.form_load_counts",
      ),
    ).toEqual([]);
    expect(
      await queryAs(
        db,
        { userId: max },
        "select day, count from public.form_load_counts",
      ),
    ).toHaveLength(1);
  });

  it("lets nobody signed in write load counts", async () => {
    await expect(
      queryAs(
        db,
        { userId: max },
        "update public.form_load_counts set count = 1000",
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("is closed to the anon role", async () => {
    await expect(queryAs(db, "anon", STATISTICS, [form, 7])).rejects.toThrow(
      /permission denied/,
    );
  });

  it("refuses periods other than 1 to 366 days", async () => {
    await expect(statistics({ userId: max }, 0)).rejects.toThrow(/period/);
    await expect(statistics({ userId: max }, 367)).rejects.toThrow(/period/);
  });
});

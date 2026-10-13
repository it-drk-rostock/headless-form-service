import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  commitAs,
  createAuthUser,
  migratedDatabase,
  queryAs,
} from "./database.ts";

describe("keep_alive heartbeat", () => {
  let db: PGlite;
  let userId: string;

  beforeAll(async () => {
    db = await migratedDatabase();
    userId = await createAuthUser(db, "user@example.test");
  }, 60000);

  it("can be touched by the service role, creating and incrementing the count", async () => {
    const first = await commitAs<{ touch_keep_alive: { status: string; count: number; source: string } }>(
      db,
      "service",
      "select public.touch_keep_alive('cron') as touch_keep_alive",
    );

    expect(first[0].touch_keep_alive.status).toBe("ok");
    expect(first[0].touch_keep_alive.count).toBe(1);
    expect(first[0].touch_keep_alive.source).toBe("cron");

    const second = await commitAs<{ touch_keep_alive: { status: string; count: number; source: string } }>(
      db,
      "service",
      "select public.touch_keep_alive('custom-source') as touch_keep_alive",
    );

    expect(second[0].touch_keep_alive.status).toBe("ok");
    expect(second[0].touch_keep_alive.count).toBe(2);
    expect(second[0].touch_keep_alive.source).toBe("custom-source");
  });

  it("defaults empty source to cron", async () => {
    const res = await commitAs<{ touch_keep_alive: { source: string } }>(
      db,
      "service",
      "select public.touch_keep_alive('   ') as touch_keep_alive",
    );

    expect(res[0].touch_keep_alive.source).toBe("cron");
  });

  it("is refused to anon and authenticated callers", async () => {
    await expect(
      queryAs(db, "anon", "select public.touch_keep_alive('cron')"),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      queryAs(db, { userId }, "select public.touch_keep_alive('cron')"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps private.keep_alive inaccessible directly", async () => {
    await expect(
      queryAs(db, "anon", "select * from private.keep_alive"),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      queryAs(db, { userId }, "select * from private.keep_alive"),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      commitAs(db, "service", "select * from private.keep_alive"),
    ).rejects.toThrow(/permission denied/i);
  });
});

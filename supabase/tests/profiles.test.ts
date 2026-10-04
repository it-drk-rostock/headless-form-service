import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAuthUser,
  migratedDatabase,
  queryAs,
  readSnippet,
} from "./database.ts";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  is_super_admin: boolean;
};

let db: PGlite;

beforeEach(async () => {
  db = await migratedDatabase();
});

async function profile(id: string): Promise<ProfileRow | undefined> {
  const { rows } = await db.query<ProfileRow>(
    "select id, email, full_name, is_super_admin from public.profiles where id = $1",
    [id],
  );
  return rows[0];
}

async function makeFirstSuperAdmin(email: string) {
  await db.exec(
    readSnippet("first-super-admin.sql").replace(
      "first.admin@example.org",
      email,
    ),
  );
}

describe("profiles", () => {
  it("are created for every new auth user, never as Super Admin", async () => {
    const id = await createAuthUser(db, "anna@drk-rostock.de", {
      full_name: " Anna Schmidt ",
    });

    expect(await profile(id)).toEqual({
      id,
      email: "anna@drk-rostock.de",
      full_name: "Anna Schmidt",
      is_super_admin: false,
    });
  });

  it("get an empty name when the invite carried none", async () => {
    const id = await createAuthUser(db, "max@drk-rostock.de");
    expect((await profile(id))?.full_name).toBe("");
  });

  it("follow email changes of the auth user", async () => {
    const id = await createAuthUser(db, "old@drk-rostock.de");
    await db.query("update auth.users set email = $1 where id = $2", [
      "new@drk-rostock.de",
      id,
    ]);
    expect((await profile(id))?.email).toBe("new@drk-rostock.de");
  });

  it("disappear with the auth user", async () => {
    const id = await createAuthUser(db, "gone@drk-rostock.de");
    await db.query("delete from auth.users where id = $1", [id]);
    expect(await profile(id)).toBeUndefined();
  });
});

describe("profile access", () => {
  it("lets people see only their own profile", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    await createAuthUser(db, "max@drk-rostock.de");

    const rows = await queryAs<ProfileRow>(
      db,
      { userId: anna },
      "select id from public.profiles",
    );
    expect(rows).toEqual([{ id: anna }]);
  });

  it("lets Super Admins see every profile", async () => {
    const admin = await createAuthUser(db, "admin@drk-rostock.de");
    await createAuthUser(db, "max@drk-rostock.de");
    await makeFirstSuperAdmin("admin@drk-rostock.de");

    const rows = await queryAs(
      db,
      { userId: admin },
      "select id from public.profiles",
    );
    expect(rows).toHaveLength(2);
  });

  it("gives the anon role no access", async () => {
    await createAuthUser(db, "anna@drk-rostock.de");
    await expect(
      queryAs(db, "anon", "select id from public.profiles"),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let people make themselves Super Admin", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    await expect(
      queryAs(
        db,
        { userId: anna },
        "update public.profiles set is_super_admin = true where id = $1",
        [anna],
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(
        db,
        { userId: anna },
        "insert into public.profiles (id, email) values (gen_random_uuid(), 'x@y.de')",
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("first Super Admin bootstrap", () => {
  it("promotes the named person, ignoring case", async () => {
    const id = await createAuthUser(db, "First.Admin@drk-rostock.de");
    await makeFirstSuperAdmin("first.admin@DRK-rostock.de");
    expect((await profile(id))?.is_super_admin).toBe(true);
  });

  it("does nothing once a Super Admin exists", async () => {
    await createAuthUser(db, "first@drk-rostock.de");
    const second = await createAuthUser(db, "second@drk-rostock.de");
    await makeFirstSuperAdmin("first@drk-rostock.de");
    await makeFirstSuperAdmin("second@drk-rostock.de");
    expect((await profile(second))?.is_super_admin).toBe(false);
  });
});

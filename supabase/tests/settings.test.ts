import { readFileSync } from "node:fs";
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

const READ =
  "select allowed_origins, load_rate_limit, submit_rate_limit from public.settings";
const UPDATE_ORIGINS = "update public.settings set allowed_origins = $1";
const RESTORE_SETTINGS = readFileSync(
  new URL(
    "../migrations/20261015075716_restore_missing_settings.sql",
    import.meta.url,
  ),
  "utf8",
);

beforeEach(async () => {
  db = await migratedDatabase();
  root = await createSuperAdmin(db, "root@drk-rostock.de");
  anna = await createAuthUser(db, "anna@drk-rostock.de");
  await addTeamMember(
    db,
    await createTeam(db, "Erste Hilfe"),
    anna,
    "team_admin",
  );
  // The setup above ran without a signed-in person; start from an empty log.
  await db.exec("alter table public.audit_log disable trigger user");
  await db.exec("delete from public.audit_log");
  await db.exec("alter table public.audit_log enable trigger user");
});

async function entries() {
  const { rows } = await db.query<{
    team_id: string | null;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown>;
  }>(
    `select team_id, actor_id, action, entity_type, entity_id, details
     from public.audit_log order by id`,
  );
  return rows;
}

describe("repairing a missing settings row", () => {
  it("restores settings visible to a Super Admin without exposing them to members", async () => {
    await db.exec("delete from public.settings");
    await db.exec(RESTORE_SETTINGS);

    expect(
      await queryAs(
        db,
        { userId: root },
        "select allowed_origins, allowed_recipient_domains, load_rate_limit, submit_rate_limit from public.settings",
      ),
    ).toEqual([
      {
        allowed_origins: ["http://localhost:3000"],
        allowed_recipient_domains: ["drk-rostock.de"],
        load_rate_limit: 60,
        submit_rate_limit: 3,
      },
    ]);
    expect(await queryAs(db, { userId: anna }, READ)).toEqual([]);
  });

  it("preserves existing settings when run again", async () => {
    await commitAs(
      db,
      { userId: root },
      `update public.settings set allowed_origins = '{https://example.com}',
       allowed_recipient_domains = '{example.com}',
       load_rate_limit = 120, submit_rate_limit = 5`,
    );
    const before = await db.query("select * from public.settings");
    await db.exec(RESTORE_SETTINGS);
    await db.exec(RESTORE_SETTINGS);
    expect((await db.query("select * from public.settings")).rows).toEqual(
      before.rows,
    );
    expect(await entries()).toHaveLength(4);
  });
});

describe("who may read and change the settings", () => {
  it("lets members read only the global theme and reserves changes for Super Admins", async () => {
    const theme = { cssVariables: { "--sjs-primary-backcolor": "#123456" } };
    await commitAs(
      db,
      { userId: root },
      "update public.settings set global_theme = $1",
      [theme],
    );
    expect(
      await queryAs(
        db,
        { userId: anna },
        "select public.get_global_theme() as theme",
      ),
    ).toEqual([{ theme }]);
    expect(await queryAs(db, { userId: anna }, READ)).toEqual([]);
    expect(
      await queryAs(
        db,
        { userId: anna },
        "update public.settings set global_theme = null returning 1",
      ),
    ).toEqual([]);
    await expect(
      queryAs(db, "anon", "select public.get_global_theme()"),
    ).rejects.toThrow(/permission denied/);
    await commitAs(
      db,
      { userId: root },
      "update public.settings set global_theme = null",
    );
    expect(
      await queryAs(
        db,
        { userId: anna },
        "select public.get_global_theme() as theme",
      ),
    ).toEqual([{ theme: null }]);
  });
  it("lets Super Admins read them", async () => {
    expect(await queryAs(db, { userId: root }, READ)).toEqual([
      {
        allowed_origins: ["http://localhost:3000"],
        load_rate_limit: 60,
        submit_rate_limit: 3,
      },
    ]);
  });

  it("lets Super Admins change origins and both limits", async () => {
    await commitAs(
      db,
      { userId: root },
      `update public.settings
       set allowed_origins = $1, load_rate_limit = 120, submit_rate_limit = 5`,
      [["https://www.drk-rostock.de"]],
    );

    // The edge functions read with the secret key, on every request.
    expect(await commitAs(db, "service", READ)).toEqual([
      {
        allowed_origins: ["https://www.drk-rostock.de"],
        load_rate_limit: 120,
        submit_rate_limit: 5,
      },
    ]);
  });

  it("shows Team Admins and members nothing and lets them change nothing", async () => {
    expect(await queryAs(db, { userId: anna }, READ)).toEqual([]);
    expect(
      await queryAs(db, { userId: anna }, `${UPDATE_ORIGINS} returning 1`, [
        ["https://evil.example"],
      ]),
    ).toEqual([]);
  });

  it("is closed to visitors", async () => {
    await expect(queryAs(db, "anon", READ)).rejects.toThrow(
      /permission denied/,
    );
  });

  it("cannot be added to or deleted, not even by Super Admins", async () => {
    await expect(
      queryAs(db, { userId: root }, "delete from public.settings"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(
        db,
        { userId: root },
        "insert into public.settings (id) values (true)",
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("leaves no other column writable", async () => {
    await expect(
      queryAs(
        db,
        { userId: root },
        "update public.settings set updated_at = now()",
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("the database refuses invalid values", () => {
  it.each([
    [],
    "default",
    { isPanelless: "yes" },
    { colorPalette: "blue" },
    { backgroundOpacity: 2 },
    { cssVariables: [] },
    { cssVariables: { "--sjs-primary-backcolor": 123 } },
    { header: { height: "large" } },
    { header: { titlePositionX: "top" } },
    { notAThemeProperty: true },
  ])("preserves the saved theme when invalid input is submitted: %j", async (invalid) => {
    const theme = {
      themeName: "default",
      cssVariables: { "--sjs-primary-backcolor": "#123456" },
    };
    await commitAs(
      db,
      { userId: root },
      "update public.settings set global_theme = $1",
      [theme],
    );
    await expect(
      queryAs(
        db,
        { userId: root },
        "update public.settings set global_theme = $1",
        [JSON.stringify(invalid)],
      ),
    ).rejects.toThrow(/settings_global_theme_check/);
    expect(
      await queryAs(
        db,
        { userId: root },
        "select global_theme from public.settings",
      ),
    ).toEqual([{ global_theme: theme }]);
  });

  it("round-trips a SurveyJS theme including advanced header settings", async () => {
    const theme = {
      themeName: "default",
      colorPalette: "dark",
      isPanelless: false,
      backgroundOpacity: 0.5,
      headerView: "advanced",
      header: {
        height: 200,
        titlePositionX: "center",
        backgroundImageFit: "tile",
      },
      cssVariables: { "--sjs-primary-backcolor": "#123456" },
    };
    await commitAs(
      db,
      { userId: root },
      "update public.settings set global_theme = $1",
      [theme],
    );
    expect(
      await queryAs(
        db,
        { userId: anna },
        "select public.get_global_theme() as theme",
      ),
    ).toEqual([{ theme }]);
    expect((await entries()).map((e) => e.action)).toContain(
      "settings.theme_changed",
    );
  });
  it.each([
    ["a path", "https://www.drk-rostock.de/kurse"],
    ["a trailing slash", "https://www.drk-rostock.de/"],
    ["another scheme", "ftp://www.drk-rostock.de"],
    ["upper case", "https://WWW.drk-rostock.de"],
    ["a wildcard", "https://*.drk-rostock.de"],
    ["an empty entry", ""],
  ])("refuses an origin with %s", async (_, origin) => {
    await expect(
      queryAs(db, { userId: root }, UPDATE_ORIGINS, [[origin]]),
    ).rejects.toThrow(/settings_allowed_origins_check/);
  });

  it("accepts origins with a port", async () => {
    await expect(
      queryAs(db, { userId: root }, UPDATE_ORIGINS, [
        ["http://localhost:3000", "https://192.168.0.10:8443"],
      ]),
    ).resolves.toEqual([]);
  });

  it("refuses more than 100 origins", async () => {
    const many = Array.from(
      { length: 101 },
      (_, i) => `https://site${i}.drk-rostock.de`,
    );
    await expect(
      queryAs(db, { userId: root }, UPDATE_ORIGINS, [many]),
    ).rejects.toThrow(/settings_allowed_origins_check/);
  });

  it.each([
    ["load_rate_limit", 0],
    ["load_rate_limit", 100_001],
    ["submit_rate_limit", 0],
    ["submit_rate_limit", 100_001],
  ])("refuses %s = %i", async (column, value) => {
    await expect(
      queryAs(
        db,
        { userId: root },
        `update public.settings set ${column} = $1`,
        [value],
      ),
    ).rejects.toThrow(new RegExp(`settings_${column}_check`));
  });
});

describe("changes are recorded in the audit log", () => {
  it("records each changed setting with its old and new value", async () => {
    await commitAs(
      db,
      { userId: root },
      `update public.settings
       set allowed_origins = $1, load_rate_limit = 120, submit_rate_limit = 5`,
      [["http://localhost:3000", "https://www.drk-rostock.de"]],
    );

    const setting = {
      team_id: null,
      actor_id: root,
      entity_type: "settings",
      entity_id: null,
    };
    expect(await entries()).toEqual([
      {
        ...setting,
        action: "settings.origins_changed",
        details: {
          from: ["http://localhost:3000"],
          to: ["http://localhost:3000", "https://www.drk-rostock.de"],
        },
      },
      {
        ...setting,
        action: "settings.load_limit_changed",
        details: { from: 60, to: 120 },
      },
      {
        ...setting,
        action: "settings.submit_limit_changed",
        details: { from: 3, to: 5 },
      },
    ]);
  });

  it("records only what changed", async () => {
    await commitAs(
      db,
      { userId: root },
      `update public.settings
       set allowed_origins = allowed_origins, load_rate_limit = 60, submit_rate_limit = 4`,
    );

    expect((await entries()).map((entry) => entry.action)).toEqual([
      "settings.submit_limit_changed",
    ]);
  });

  it("records nothing for a save that changes nothing", async () => {
    await commitAs(
      db,
      { userId: root },
      "update public.settings set load_rate_limit = 60",
    );

    expect(await entries()).toEqual([]);
  });

  it("shows the entries to Super Admins only", async () => {
    await commitAs(
      db,
      { userId: root },
      "update public.settings set load_rate_limit = 61",
    );
    const READ_LOG = "select action from public.audit_log";

    expect(await queryAs(db, { userId: root }, READ_LOG)).toEqual([
      { action: "settings.load_limit_changed" },
    ]);
    expect(await queryAs(db, { userId: anna }, READ_LOG)).toEqual([]);
  });
});

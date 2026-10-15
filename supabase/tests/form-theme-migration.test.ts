import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  addTeamMember,
  commitAs,
  createAuthUser,
  createTeam,
  migratedDatabase,
  queryAs,
} from "./database.ts";

it("upgrades existing drafts and published versions to inheritance without changing their content or save stamp", async () => {
  const migration = "20261015113432_custom_form_themes.sql";
  const db = await migratedDatabase(migration);
  try {
    const team = await createTeam(db, "Existing forms");
    const user = await createAuthUser(db, "existing@example.invalid");
    await addTeamMember(db, team, user);
    const schema = { elements: [{ type: "text", name: "name" }] };
    const {
      rows: [form],
    } = await db.query<{ id: string }>(
      "insert into public.forms (team_id, name, draft_schema) values ($1, 'Existing form', $2) returning id",
      [team, schema],
    );
    await commitAs(db, { userId: user }, "select public.publish_form($1)", [
      form.id,
    ]);
    const read = () =>
      queryAs(
        db,
        { userId: user },
        "select draft_schema, draft_email_template, draft_updated_at, draft_updated_by from public.forms where id = $1",
        [form.id],
      );
    const before = await read();
    await db.exec(
      readFileSync(
        new URL(`../migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
    expect(await read()).toEqual(before);
    expect(
      await queryAs(
        db,
        { userId: user },
        "select draft_theme from public.forms where id = $1",
        [form.id],
      ),
    ).toEqual([{ draft_theme: null }]);
    expect(
      await commitAs(
        db,
        "service",
        "select version, schema, theme from public.load_form($1)",
        [form.id],
      ),
    ).toEqual([{ version: 1, schema, theme: null }]);
  } finally {
    await db.close();
  }
});

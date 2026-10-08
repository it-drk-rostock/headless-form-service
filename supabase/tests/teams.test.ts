import type { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAuthUser,
  migratedDatabase,
  queryAs,
  readSnippet,
} from "./database.ts";

let db: PGlite;

beforeEach(async () => {
  db = await migratedDatabase();
});

async function superAdmin(email: string): Promise<string> {
  const id = await createAuthUser(db, email);
  await db.query(
    "update public.profiles set is_super_admin = true where id = $1",
    [id],
  );
  return id;
}

async function team(name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into public.teams (name) values ($1) returning id",
    [name],
  );
  return rows[0].id;
}

async function addMember(
  teamId: string,
  userId: string,
  role: "team_admin" | "member" = "member",
) {
  await db.query(
    "insert into public.team_members (team_id, user_id, role) values ($1, $2, $3)",
    [teamId, userId, role],
  );
}

describe("teams", () => {
  it("can be created by a Super Admin", async () => {
    const admin = await superAdmin("admin@drk-rostock.de");

    const created = await queryAs(
      db,
      { userId: admin },
      "insert into public.teams (name) values ('Blutspende') returning name",
    );
    expect(created).toEqual([{ name: "Blutspende" }]);
  });

  it("can be renamed by a Super Admin who is not a member", async () => {
    const admin = await superAdmin("admin@drk-rostock.de");
    const bloodDrive = await team("Blutspende");

    const renamed = await queryAs(
      db,
      { userId: admin },
      "update public.teams set name = 'Blutspendedienst' where id = $1 returning name",
      [bloodDrive],
    );
    expect(renamed).toEqual([{ name: "Blutspendedienst" }]);
  });

  it("cannot be created by anyone else, not even a Team Admin", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    await addMember(await team("Erste Hilfe"), anna, "team_admin");

    await expect(
      queryAs(
        db,
        { userId: anna },
        "insert into public.teams (name) values ('Eigenes Team')",
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot be renamed by a Team Admin of that team", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    const firstAid = await team("Erste Hilfe");
    await addMember(firstAid, anna, "team_admin");

    const renamed = await queryAs(
      db,
      { userId: anna },
      "update public.teams set name = 'Umbenannt' where id = $1 returning id",
      [firstAid],
    );
    expect(renamed).toEqual([]);
  });

  it("need a name that is not blank", async () => {
    await expect(team("   ")).rejects.toThrow(/teams_name_check/);
  });

  it("are visible only to their members", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    const firstAid = await team("Erste Hilfe");
    await team("Blutspende");
    await addMember(firstAid, anna);

    const rows = await queryAs(
      db,
      { userId: anna },
      "select id from public.teams",
    );
    expect(rows).toEqual([{ id: firstAid }]);
  });

  it("are all visible to a Super Admin without membership", async () => {
    const admin = await superAdmin("admin@drk-rostock.de");
    await team("Erste Hilfe");
    await team("Blutspende");

    const rows = await queryAs(
      db,
      { userId: admin },
      "select id from public.teams",
    );
    expect(rows).toHaveLength(2);
  });

  it("give the anon role no access", async () => {
    await team("Erste Hilfe");
    await expect(
      queryAs(db, "anon", "select id from public.teams"),
    ).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, "anon", "select team_id from public.team_members"),
    ).rejects.toThrow(/permission denied/);
  });

  it("disappear with their memberships", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    const firstAid = await team("Erste Hilfe");
    await addMember(firstAid, anna);

    await db.query("delete from public.teams where id = $1", [firstAid]);
    const { rows } = await db.query("select 1 from public.team_members");
    expect(rows).toEqual([]);
  });
});

describe("team members", () => {
  it("have the role team_admin or member", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    await expect(
      db.query(
        "insert into public.team_members (team_id, user_id, role) values ($1, $2, 'owner')",
        [await team("Erste Hilfe"), anna],
      ),
    ).rejects.toThrow(/invalid input value for enum/);
  });

  it("belong to a team only once", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    const firstAid = await team("Erste Hilfe");
    await addMember(firstAid, anna, "member");
    await expect(addMember(firstAid, anna, "team_admin")).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("can belong to several teams", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    await addMember(await team("Erste Hilfe"), anna, "team_admin");
    await addMember(await team("Blutspende"), anna, "member");

    const rows = await queryAs(
      db,
      { userId: anna },
      "select role from public.team_members order by role",
    );
    expect(rows).toEqual([{ role: "team_admin" }, { role: "member" }]);
  });

  it("are visible to the members of the same team only", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    const max = await createAuthUser(db, "max@drk-rostock.de");
    const eve = await createAuthUser(db, "eve@drk-rostock.de");
    const firstAid = await team("Erste Hilfe");
    await addMember(firstAid, anna);
    await addMember(firstAid, max);
    await addMember(await team("Blutspende"), eve);

    const rows = await queryAs<{ user_id: string }>(
      db,
      { userId: anna },
      "select user_id from public.team_members",
    );
    expect(rows.map((r) => r.user_id).sort()).toEqual([anna, max].sort());
  });

  it("are all visible to a Super Admin", async () => {
    const admin = await superAdmin("admin@drk-rostock.de");
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    await addMember(await team("Erste Hilfe"), anna);
    await addMember(await team("Blutspende"), anna);

    const rows = await queryAs(
      db,
      { userId: admin },
      "select team_id from public.team_members",
    );
    expect(rows).toHaveLength(2);
  });

  it("cannot add themselves to a team or change their role", async () => {
    const anna = await createAuthUser(db, "anna@drk-rostock.de");
    const firstAid = await team("Erste Hilfe");
    await addMember(firstAid, anna, "member");

    await expect(
      queryAs(
        db,
        { userId: anna },
        "insert into public.team_members (team_id, user_id) values ($1, $2)",
        [await team("Blutspende"), anna],
      ),
    ).rejects.toThrow(/row-level security/);
    const promoted = await queryAs(
      db,
      { userId: anna },
      "update public.team_members set role = 'team_admin' where user_id = $1 returning role",
      [anna],
    );
    expect(promoted).toEqual([]);
  });
});

describe("manual RLS checklist", () => {
  const checklist = readSnippet("rls-checklist-teams.sql");

  it("passes against the migrations and keeps nothing", async () => {
    await db.exec(checklist);
    const { rows } = await db.query("select 1 from public.teams");
    expect(rows).toEqual([]);
  });

  it("catches a team that leaks to non-members", async () => {
    await db.exec(`create policy "leak" on public.teams for select
      to authenticated using (true)`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 1 failed/);
  });

  it("catches a team that can lose its last Team Admin", async () => {
    await db.exec(
      "drop trigger team_members_keep_last_team_admin on public.team_members",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 14 failed/);
  });

  it("catches an audit log that leaks to members", async () => {
    await db.exec(`create policy "leak" on public.audit_log for select
      to authenticated using (true)`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 16 failed/);
  });

  it("catches membership changes that are not recorded", async () => {
    await db.exec(
      "drop trigger team_members_audit_role_change on public.team_members",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 17 failed/);
  });

  it("catches forms that leak to other teams", async () => {
    await db.exec(`create policy "leak" on public.forms for select
      to authenticated using (true)`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 20 failed/);
  });

  it("catches recipient changes that are not recorded", async () => {
    await db.exec("drop trigger forms_audit_settings_change on public.forms");
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 23 failed/);
  });

  it("catches draft saves without who and when", async () => {
    await db.exec("drop trigger forms_stamp_draft on public.forms");
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 26 failed/);
  });

  it("catches drafts that accept file questions", async () => {
    await db.exec(
      "alter table public.forms drop constraint forms_draft_schema_question_types_check",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 27 failed/);
  });

  it("catches form versions that can be changed directly", async () => {
    await db.exec("grant update on public.form_versions to authenticated");
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 29 failed/);
  });

  it("catches form versions that leak to other teams", async () => {
    await db.exec(`create policy "leak" on public.form_versions for select
      to authenticated using (true)`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 30 failed/);
  });

  it("catches settings that leak to Team Admins", async () => {
    await db.exec(`create policy "leak" on public.settings for select
      to authenticated using (true)`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 33 failed/);
  });

  it("catches settings changes that are not recorded", async () => {
    await db.exec("drop trigger settings_audit_change on public.settings");
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 34 failed/);
  });

  it("catches recipients outside the allowed recipient domains", async () => {
    await db.exec("drop trigger forms_check_recipient_domains on public.forms");
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 35 failed/);
  });

  it("catches restoring that is open to other teams", async () => {
    // A restore without its permission check: anyone signed in may call it.
    await db.exec(`create or replace function public.restore_form_version(form uuid, version integer)
      returns void language sql security definer set search_path = '' as $$ select $$`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 36 failed/);
  });

  it("catches discarding that is open to other teams", async () => {
    // A discard without its permission check: anyone signed in may call it.
    await db.exec(`create or replace function public.discard_draft_changes(form uuid)
      returns void language sql security definer set search_path = '' as $$ select $$`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 36 failed/);
  });

  it("catches closing that is not recorded", async () => {
    // A settings trigger that does not fire when is_closed changes.
    await db.exec(`drop trigger forms_audit_settings_change on public.forms;
      create trigger forms_audit_settings_change
        after update of name, recipients on public.forms
        for each row execute function private.audit_form_change()`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 39 failed/);
  });

  it("catches archiving that is not recorded", async () => {
    // A settings trigger that does not fire when archived_at changes.
    await db.exec(`drop trigger forms_audit_settings_change on public.forms;
      create trigger forms_audit_settings_change
        after update of name, recipients, is_closed on public.forms
        for each row execute function private.audit_form_change()`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 41 failed/);
  });

  it("catches hard delete open to Team Admins", async () => {
    await db.exec(`create or replace function public.delete_form(form uuid)
      returns void language sql security definer set search_path = '' as $$
        delete from public.forms where id = form $$`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 42 failed/);
  });

  it("catches form passes open to other teams", async () => {
    await db.exec(`create or replace function public.revoke_form_pass(pass uuid)
      returns void language sql security definer set search_path = '' as $$
        update public.form_passes set revoked_at = now() where id = pass $$`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 43 failed/);
  });

  it("catches form pass hashes members can read", async () => {
    await db.exec(
      "grant select (token_hash) on public.form_passes to authenticated",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 43 failed/);
  });

  it("catches form passes that are not recorded", async () => {
    await db.exec(
      "drop trigger form_passes_audit_revoke on public.form_passes",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 44 failed/);
  });

  it("catches delivery failures open to other teams", async () => {
    await db.exec(`create or replace function public.delivery_retry_message(submission uuid)
      returns text language sql security definer set search_path = '' as $$
        select qstash_message_id from public.form_stats where id = submission $$`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 45 failed/);
  });

  it("catches QStash message IDs members can read", async () => {
    await db.exec(
      "grant select (qstash_message_id) on public.form_stats to authenticated",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 45 failed/);
  });

  it("catches retries that are not recorded", async () => {
    await db.exec(`create or replace function public.record_delivery_retry(submission uuid, message text)
      returns void language plpgsql security definer set search_path = '' as $$
      begin
        perform private.delivery_retry_team(submission);
        update public.form_stats set status = 'queued' where id = submission;
      end $$`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 46 failed/);
  });

  it("catches form loads open to other teams", async () => {
    await db.exec(`create policy "leak" on public.form_load_counts for select
      to authenticated using (true)`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 47 failed/);
  });

  it("catches statistics open to other teams", async () => {
    await db.exec(
      "alter function public.form_statistics(uuid, integer) security definer",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 47 failed/);
  });

  it("catches statistics members of the form's team cannot see", async () => {
    await db.exec(`drop policy "Members see their teams' form loads, Super Admins see all"
      on public.form_load_counts`);
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 47 failed/);
  });

  it("catches anon reading statistics", async () => {
    await db.exec(
      "grant execute on function public.form_statistics(uuid, integer) to anon",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 32 failed/);
  });

  it("catches any table the anon role can read", async () => {
    await db.exec("grant select on public.form_load_counts to anon");
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 32 failed/);
  });

  it("catches a sequence the anon role can use, and names it", async () => {
    await db.exec("grant usage on sequence public.audit_log_id_seq to anon");
    await expect(db.exec(checklist)).rejects.toThrow(
      /RLS check 32 failed: anon has a privilege on public\.audit_log_id_seq/,
    );
  });

  it("catches a column the anon role can read", async () => {
    await db.exec("grant select (allowed_origins) on public.settings to anon");
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 32 failed/);
  });

  it("catches anon loading forms", async () => {
    await db.exec("grant execute on function public.load_form(uuid) to anon");
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 32 failed/);
  });

  it("catches anon counting form loads", async () => {
    await db.exec(
      "grant execute on function public.count_form_load(uuid) to anon",
    );
    await expect(db.exec(checklist)).rejects.toThrow(/RLS check 32 failed/);
  });
});

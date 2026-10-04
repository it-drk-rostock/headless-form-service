import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const supabaseDir = join(import.meta.dirname, "..");

/**
 * The parts of a Supabase database our migrations rely on: the API roles with
 * Supabase's default grants on `public`, a minimal `auth.users`, and
 * `auth.uid()` reading the JWT claims the way PostgREST sets them.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant all on functions to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid
  $$;
  grant execute on function auth.uid() to anon, authenticated, service_role;
`;

/** A fresh in-memory database with every migration in `supabase/migrations/` applied. */
export async function migratedDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const dir = join(supabaseDir, "migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  return db;
}

export function readSnippet(name: string): string {
  return readFileSync(join(supabaseDir, "snippets", name), "utf8");
}

/** Runs `query` as a signed-in person (or anon), as PostgREST would, and rolls back. */
export async function queryAs<T>(
  db: PGlite,
  who: { userId: string } | "anon",
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    const role = who === "anon" ? "anon" : "authenticated";
    const claims = who === "anon" ? { role } : { role, sub: who.userId };
    await tx.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(claims),
    ]);
    await tx.exec(`set local role ${role}`);
    const { rows } = await tx.query<T>(query, params);
    await tx.rollback();
    return rows;
  });
}

export async function createAuthUser(
  db: PGlite,
  email: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify(metadata)],
  );
  return rows[0].id;
}

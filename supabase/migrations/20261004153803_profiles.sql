-- Profiles: one row per auth user (blueprint §3). Accounts exist only by
-- invitation, so a row is created by trigger when Supabase Auth creates the user.

-- Helpers that RLS policies and triggers call. Not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  is_super_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth user. Created and kept in sync by triggers on auth.users.';
comment on column public.profiles.is_super_admin is
  'Authority over every team. The first one is set by hand (README, "First Super Admin").';

-- The anon role has no table access at all (ADR-0004). Signed-in people only
-- read; profile changes go through later, narrower paths.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

alter table public.profiles enable row level security;

-- Security definer, so policies on `profiles` can ask this without recursing
-- into their own RLS. Only ever answers for the calling user.
create function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke all on function private.is_super_admin() from public;
grant execute on function private.is_super_admin() to authenticated;

create policy "People see their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "Super Admins see every profile"
  on public.profiles for select
  to authenticated
  using ((select private.is_super_admin()));

-- Keeps updated_at current. Reused by later tables.
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Runs as the owner because Supabase Auth's role cannot write to public tables.
-- `full_name` comes from the invite's user metadata; it is display data only and
-- never used for authorisation.
create function private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(trim(new.raw_user_meta_data ->> 'full_name'), '')
  );
  return new;
end;
$$;

revoke all on function private.create_profile_for_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_profile_for_new_user();

create function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

revoke all on function private.sync_profile_email() from public;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sync_profile_email();

-- Accounts created before this migration.
insert into public.profiles (id, email, full_name)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(trim(u.raw_user_meta_data ->> 'full_name'), '')
from auth.users u
on conflict (id) do nothing;

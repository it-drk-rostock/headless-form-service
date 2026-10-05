-- Teams and their members (blueprint §2, §3). A team is the boundary of what
-- its members can see and change; Super Admins see across all teams.

create type public.team_role as enum ('team_admin', 'member');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.team_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

comment on table public.team_members is
  'Who belongs to which team. A person can belong to several teams, with one role per team.';

-- The primary key covers lookups by team; this one covers "my teams" and the
-- profile cascade.
create index team_members_user_id_idx on public.team_members (user_id);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function private.set_updated_at();

-- Security definer, so policies on `team_members` can ask this without
-- recursing into their own RLS. Only ever answers for the calling user.
create function private.is_team_member(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = team and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_team_member(uuid) from public;
grant execute on function private.is_team_member(uuid) to authenticated;

-- The anon role has no table access at all (ADR-0004). Signed-in people may
-- create and rename teams (RLS narrows this to Super Admins) and read
-- memberships; membership changes arrive with membership management.
revoke all on public.teams, public.team_members from anon, authenticated;
grant select, insert on public.teams to authenticated;
grant update (name) on public.teams to authenticated;
grant select on public.team_members to authenticated;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy "Members see their teams, Super Admins see all"
  on public.teams for select
  to authenticated
  using ((select private.is_super_admin()) or (select private.is_team_member(id)));

create policy "Super Admins create teams"
  on public.teams for insert
  to authenticated
  with check ((select private.is_super_admin()));

create policy "Super Admins rename teams"
  on public.teams for update
  to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

create policy "Members see their team's members, Super Admins see all"
  on public.team_members for select
  to authenticated
  using (
    (select private.is_super_admin()) or (select private.is_team_member(team_id))
  );

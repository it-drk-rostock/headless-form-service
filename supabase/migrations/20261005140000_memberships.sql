-- Membership management (blueprint §2.1, §2.2): Team Admins manage the members
-- of their own team, Super Admins those of every team. A team never loses its
-- last Team Admin unless a Super Admin does it.

-- Security definer, so policies on `team_members` can ask this without
-- recursing into their own RLS. Only ever answers for the calling user.
create function private.is_team_admin(team uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = team
      and m.user_id = (select auth.uid())
      and m.role = 'team_admin'
  );
$$;

revoke all on function private.is_team_admin(uuid) from public;
grant execute on function private.is_team_admin(uuid) to authenticated;

-- Whether the calling user and `person` belong to at least one common team.
create function private.shares_team_with(person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members mine
    join public.team_members theirs on theirs.team_id = mine.team_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = person
  );
$$;

revoke all on function private.shares_team_with(uuid) from public;
grant execute on function private.shares_team_with(uuid) to authenticated;

-- Members see who else is in their teams (the member list).
create policy "People see the profiles of their teammates"
  on public.profiles for select
  to authenticated
  using ((select private.shares_team_with(id)));

-- Only the role can change; moving a membership to another team or person is
-- a removal plus an invite.
grant insert, delete on public.team_members to authenticated;
grant update (role) on public.team_members to authenticated;

create policy "Team Admins and Super Admins add members"
  on public.team_members for insert
  to authenticated
  with check (
    (select private.is_super_admin()) or (select private.is_team_admin(team_id))
  );

create policy "Team Admins and Super Admins change roles"
  on public.team_members for update
  to authenticated
  using (
    (select private.is_super_admin()) or (select private.is_team_admin(team_id))
  )
  with check (
    (select private.is_super_admin()) or (select private.is_team_admin(team_id))
  );

create policy "Team Admins and Super Admins remove members"
  on public.team_members for delete
  to authenticated
  using (
    (select private.is_super_admin()) or (select private.is_team_admin(team_id))
  );

-- A team never loses its last Team Admin (blueprint §2.2). Only a Super Admin
-- may override this. Requests without a signed-in person (service role, SQL
-- editor) are trusted, and a team or account being deleted takes its
-- memberships with it.
--
-- Runs after the statement's rows have changed, so removing every Team Admin
-- at once is caught too. The team row is locked so two Team Admins demoting
-- each other at the same time cannot both succeed. Fails with SQLSTATE HF001,
-- which the dashboard turns into a message.
create function private.keep_last_team_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role <> 'team_admin'
     or (tg_op = 'UPDATE' and new.role = 'team_admin')
     or (select auth.uid()) is null
     or (select private.is_super_admin()) then
    return null;
  end if;

  perform 1 from public.teams t where t.id = old.team_id for no key update;
  if not found then
    return null; -- the team itself is being deleted
  end if;

  if not exists (
    select 1 from public.team_members m
    where m.team_id = old.team_id and m.role = 'team_admin'
  ) then
    raise exception 'A team cannot lose its last Team Admin'
      using errcode = 'HF001',
            hint = 'Make someone else Team Admin first, or ask a Super Admin.';
  end if;
  return null;
end;
$$;

revoke all on function private.keep_last_team_admin() from public;

create trigger team_members_keep_last_team_admin
  after update of role or delete on public.team_members
  for each row execute function private.keep_last_team_admin();

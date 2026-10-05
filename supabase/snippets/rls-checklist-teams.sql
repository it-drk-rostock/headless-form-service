-- Manual RLS checklist for teams and memberships (tickets 04, 05). Run it in the Supabase SQL editor
-- after `npm run db:push`. It creates a test team setup inside a transaction,
-- checks each rule as the person it concerns, and rolls everything back.
--
-- Passed: the result is "RLS checklist passed: 15 of 15 checks". Failed: it stops with
-- "RLS check <n> failed: ..." and nothing is kept.
--
-- Test setup (all rolled back):
--   Super Admin  …c001  member of no team
--   Team Admin   …c002  team_admin of team A
--   Member A     …c003  member of team A
--   Member B     …c004  member of team B
-- `npm test` runs this file against the migrations (supabase/tests/).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000c001', 'rls-check-super-admin@example.invalid'),
  ('00000000-0000-4000-8000-00000000c002', 'rls-check-team-admin@example.invalid'),
  ('00000000-0000-4000-8000-00000000c003', 'rls-check-member-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000c004', 'rls-check-member-b@example.invalid');

update public.profiles set is_super_admin = true
where id = '00000000-0000-4000-8000-00000000c001';

insert into public.teams (id, name) values
  ('00000000-0000-4000-8000-0000000000a1', 'RLS-Check Team A'),
  ('00000000-0000-4000-8000-0000000000b1', 'RLS-Check Team B');

insert into public.team_members (team_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c002', 'team_admin'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c003', 'member'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c004', 'member');

-- As Member A ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c003"}', true);

do $$
declare
  changed int;
begin
  -- 1. A member sees only their own teams.
  if (select array_agg(id) from public.teams)
     is distinct from array['00000000-0000-4000-8000-0000000000a1'::uuid] then
    raise exception 'RLS check 1 failed: Member A sees teams other than team A';
  end if;

  -- 2. A member sees the memberships of their own team, and no others.
  if (select count(*) from public.team_members) <> 2
     or exists (select 1 from public.team_members
                where team_id <> '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'RLS check 2 failed: Member A sees memberships outside team A';
  end if;

  -- 3. A member cannot add themselves to another team.
  begin
    insert into public.team_members (team_id, user_id) values
      ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c003');
    raise exception 'RLS check 3 failed: Member A joined team B';
  exception when insufficient_privilege then null;
  end;

  -- 10. A member cannot promote themselves or remove anyone.
  update public.team_members set role = 'team_admin'
  where user_id = '00000000-0000-4000-8000-00000000c003';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 10 failed: Member A promoted themselves';
  end if;
  delete from public.team_members
  where team_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 10 failed: Member A removed members';
  end if;

  -- 11. A member sees the profiles of their teammates, and no others.
  if (select array_agg(id order by id) from public.profiles)
     is distinct from array['00000000-0000-4000-8000-00000000c002'::uuid,
                            '00000000-0000-4000-8000-00000000c003'::uuid] then
    raise exception 'RLS check 11 failed: Member A sees profiles outside team A';
  end if;
end $$;

-- As Member B ---------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c004"}', true);

do $$
begin
  -- 4. A team someone does not belong to is invisible, by ID too.
  if exists (select 1 from public.teams
             where id = '00000000-0000-4000-8000-0000000000a1')
     or exists (select 1 from public.team_members
                where team_id = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'RLS check 4 failed: Member B sees team A';
  end if;
end $$;

-- As the Team Admin of team A -------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c002"}', true);

do $$
declare
  changed int;
begin
  -- 5. A Team Admin cannot rename their team.
  update public.teams set name = 'Umbenannt'
  where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 5 failed: the Team Admin renamed team A';
  end if;

  -- 6. A Team Admin cannot create a team.
  begin
    insert into public.teams (name) values ('RLS-Check eigenes Team');
    raise exception 'RLS check 6 failed: the Team Admin created a team';
  exception when insufficient_privilege then null;
  end;

  -- 12. A Team Admin manages roles in their own team.
  update public.team_members set role = 'team_admin'
  where team_id = '00000000-0000-4000-8000-0000000000a1'
    and user_id = '00000000-0000-4000-8000-00000000c003';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 12 failed: the Team Admin could not promote Member A';
  end if;
  update public.team_members set role = 'member'
  where team_id = '00000000-0000-4000-8000-0000000000a1'
    and user_id = '00000000-0000-4000-8000-00000000c003';

  -- 13. A Team Admin cannot add to, change or remove from another team.
  begin
    insert into public.team_members (team_id, user_id) values
      ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c003');
    raise exception 'RLS check 13 failed: the Team Admin added someone to team B';
  exception when insufficient_privilege then null;
  end;
  delete from public.team_members
  where team_id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 13 failed: the Team Admin removed members of team B';
  end if;

  -- 14. The last Team Admin cannot step down or leave.
  begin
    update public.team_members set role = 'member'
    where user_id = '00000000-0000-4000-8000-00000000c002';
    raise exception 'RLS check 14 failed: the last Team Admin of team A stepped down';
  exception when sqlstate 'HF001' then null;
  end;
  begin
    delete from public.team_members
    where user_id = '00000000-0000-4000-8000-00000000c002';
    raise exception 'RLS check 14 failed: the last Team Admin of team A left';
  exception when sqlstate 'HF001' then null;
  end;
end $$;

-- As the Super Admin (member of no team) --------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c001"}', true);

do $$
declare
  changed int;
begin
  -- 7. A Super Admin sees every team and every membership.
  if (select count(*) from public.teams where id in (
        '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')) <> 2
     or (select count(*) from public.team_members where team_id in (
        '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')) <> 3 then
    raise exception 'RLS check 7 failed: the Super Admin does not see all teams';
  end if;

  -- 8. A Super Admin can rename and create teams.
  update public.teams set name = 'RLS-Check Team A2'
  where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 8 failed: the Super Admin could not rename team A';
  end if;
  insert into public.teams (name) values ('RLS-Check Team C');

  -- 15. A Super Admin may remove a team's last Team Admin.
  delete from public.team_members
  where team_id = '00000000-0000-4000-8000-0000000000a1'
    and user_id = '00000000-0000-4000-8000-00000000c002';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 15 failed: the Super Admin could not remove the last Team Admin';
  end if;
end $$;

-- As a visitor (anon) ---------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
begin
  -- 9. The anon role cannot read teams or memberships (ADR-0004).
  begin
    perform 1 from public.teams;
    raise exception 'RLS check 9 failed: anon can read teams';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.team_members;
    raise exception 'RLS check 9 failed: anon can read team members';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;

-- Shown as the result in the SQL editor; reached only if every check passed.
select 'RLS checklist passed: 15 of 15 checks' as result;

rollback;

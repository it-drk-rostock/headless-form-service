-- Audit log (blueprint §3): security-relevant actions, visible to the Team
-- Admins of the team concerned and to Super Admins. Entries are written only
-- by `private.record_audit`, which triggers and database functions call, and
-- are never changed or deleted afterwards.

create table public.audit_log (
  id bigint generated always as identity primary key,
  -- No foreign keys: an entry outlives the team, account or entity it names,
  -- and a cascade must never rewrite it.
  team_id uuid,
  actor_id uuid,
  -- Who acted, as of the moment they acted. Team Admins cannot see the
  -- profiles of Super Admins or of people who left the team.
  actor_email text,
  action text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type text not null check (entity_type ~ '^[a-z_]+$'),
  entity_id uuid,
  -- What changed, for people to read. Never submission data (blueprint §3).
  details jsonb not null default '{}'
    constraint audit_log_details_object check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.audit_log is
  'Append-only record of security-relevant actions. Written only via private.record_audit(); details never hold submission data.';
comment on column public.audit_log.actor_id is
  'The signed-in person who acted; null for the service role, the SQL editor and Supabase Auth.';

-- The log is read newest first, per team or across all teams.
create index audit_log_team_id_id_idx on public.audit_log (team_id, id desc);

-- Signed-in people only read, and RLS narrows that further. Nobody writes
-- through the Data API, not even with the secret key (service role).
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated;

alter table public.audit_log enable row level security;

create policy "Team Admins see their team's entries, Super Admins see all"
  on public.audit_log for select
  to authenticated
  using (
    (select private.is_super_admin())
    or (team_id is not null and (select private.is_team_admin(team_id)))
  );

-- Even the table owner cannot change or delete entries without first
-- dropping this trigger on purpose.
create function private.refuse_audit_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only'
    using errcode = 'HF002';
end;
$$;

revoke all on function private.refuse_audit_log_change() from public;

create trigger audit_log_append_only
  before update or delete or truncate on public.audit_log
  for each statement execute function private.refuse_audit_log_change();

-- The one way to record an entry. The actor is always the signed-in person
-- (or none), never something the caller passes in. Not callable through the
-- Data API or by signed-in people; triggers and security definer functions
-- call it as part of the change they record, so both commit or neither does.
create function private.record_audit(
  team uuid,
  action text,
  entity_type text,
  entity_id uuid,
  details jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  insert into public.audit_log
    (team_id, actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    team,
    actor,
    (select p.email from public.profiles p where p.id = actor),
    action,
    entity_type,
    entity_id,
    coalesce(details, '{}')
  );
end;
$$;

revoke all on function private.record_audit(uuid, text, text, uuid, jsonb) from public;

-- Invites, role changes and removals (ticket 05), whichever path made them.
create function private.audit_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_email text;
begin
  select p.email into member_email
  from public.profiles p
  where p.id = coalesce(new.user_id, old.user_id);

  if tg_op = 'INSERT' then
    perform private.record_audit(
      new.team_id, 'member.added', 'member', new.user_id,
      jsonb_build_object('email', member_email, 'role', new.role)
    );
  elsif tg_op = 'UPDATE' then
    perform private.record_audit(
      new.team_id, 'member.role_changed', 'member', new.user_id,
      jsonb_build_object('email', member_email, 'from', old.role, 'to', new.role)
    );
  else
    perform private.record_audit(
      old.team_id, 'member.removed', 'member', old.user_id,
      jsonb_build_object('email', member_email, 'role', old.role)
    );
  end if;
  return null;
end;
$$;

revoke all on function private.audit_membership_change() from public;

create trigger team_members_audit_insert_delete
  after insert or delete on public.team_members
  for each row execute function private.audit_membership_change();

create trigger team_members_audit_role_change
  after update of role on public.team_members
  for each row
  when (old.role is distinct from new.role)
  execute function private.audit_membership_change();

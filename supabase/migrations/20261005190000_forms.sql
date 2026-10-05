-- Forms (blueprint §3): owned by a team, created and edited by its members.
-- Settings (recipients, closed, archived, ...) live on the form and take
-- effect at once; questions and email template live in the single draft
-- until publishing freezes them into a form version.

create type public.form_access_type as enum ('public', 'protected');

-- One recipient. Arrays of a domain check every element, so a list cannot
-- smuggle a bad address in. Same rule as the dashboard (lib/shared/email.ts),
-- stored lower-case; allowed recipient domains are checked on top (ticket 21).
create domain public.email_address as text
  constraint email_address_check
  check (
    length(value) <= 254
    and value = lower(value)
    and value ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );

create table public.forms (
  -- Referenced by the embed.
  id uuid primary key default gen_random_uuid(),
  -- No cascade: deleting a team must not silently take its forms with it.
  team_id uuid not null references public.teams (id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  access_type public.form_access_type not null default 'public',
  is_closed boolean not null default false,
  archived_at timestamptz,
  page_url text,
  recipients public.email_address[] not null default '{}'
    constraint forms_recipients_check
    check (array_position(recipients, null) is null and cardinality(recipients) <= 20),
  reply_to_question text,
  sender_display_name text not null default ''
    check (length(sender_display_name) <= 100),
  turnstile_enabled boolean not null default true,
  -- The single draft. Concurrent saves are last-write-wins.
  draft_schema jsonb not null default '{}'
    check (jsonb_typeof(draft_schema) = 'object'),
  draft_email_template jsonb not null default '{}'
    check (jsonb_typeof(draft_email_template) = 'object'),
  draft_updated_by uuid references public.profiles (id) on delete set null,
  draft_updated_at timestamptz not null default now(),
  -- Null until the first publish.
  current_version integer check (current_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.forms is
  'A team''s form: settings that take effect at once, plus the single draft. Visitors reach it only through edge functions (ADR-0004).';
comment on column public.forms.recipients is
  'Where notification emails go. Every address must also match an allowed recipient domain.';

-- "Forms of my teams" and the team foreign key.
create index forms_team_id_idx on public.forms (team_id);

create trigger forms_set_updated_at
  before update on public.forms
  for each row execute function private.set_updated_at();

-- The anon role has no table access at all (ADR-0004). Signed-in people
-- create forms with a team and a name (recipients come afterwards, so every
-- list is audited as a change), and change name and recipients; the
-- other columns get their write paths with the tickets that own them
-- (designer, publishing, closing, archiving). Nobody moves a form to another
-- team or deletes it through the Data API.
revoke all on public.forms from anon, authenticated;
grant select on public.forms to authenticated;
grant insert (team_id, name) on public.forms to authenticated;
grant update (name, recipients) on public.forms to authenticated;

alter table public.forms enable row level security;

create policy "Members see their teams' forms, Super Admins see all"
  on public.forms for select
  to authenticated
  using (
    (select private.is_super_admin()) or (select private.is_team_member(team_id))
  );

create policy "Members create forms for their teams, Super Admins for all"
  on public.forms for insert
  to authenticated
  with check (
    (select private.is_super_admin()) or (select private.is_team_member(team_id))
  );

create policy "Members change their teams' forms, Super Admins all"
  on public.forms for update
  to authenticated
  using (
    (select private.is_super_admin()) or (select private.is_team_member(team_id))
  )
  with check (
    (select private.is_super_admin()) or (select private.is_team_member(team_id))
  );

-- Creating a form, renaming it and changing its recipients (blueprint §3),
-- whichever path made the change.
create function private.audit_form_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.record_audit(
      new.team_id, 'form.created', 'form', new.id,
      jsonb_build_object('name', new.name)
    );
    return null;
  end if;

  if old.name is distinct from new.name then
    perform private.record_audit(
      new.team_id, 'form.renamed', 'form', new.id,
      jsonb_build_object('from', old.name, 'to', new.name)
    );
  end if;
  if old.recipients is distinct from new.recipients then
    perform private.record_audit(
      new.team_id, 'form.recipients_changed', 'form', new.id,
      jsonb_build_object(
        'name', new.name,
        'from', to_jsonb(old.recipients::text[]),
        'to', to_jsonb(new.recipients::text[])
      )
    );
  end if;
  return null;
end;
$$;

revoke all on function private.audit_form_change() from public;

create trigger forms_audit_insert
  after insert on public.forms
  for each row execute function private.audit_form_change();

create trigger forms_audit_settings_change
  after update of name, recipients on public.forms
  for each row
  when (old.name is distinct from new.name
        or old.recipients is distinct from new.recipients)
  execute function private.audit_form_change();

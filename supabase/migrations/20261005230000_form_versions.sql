-- Publishing (blueprint §3): a team member freezes the draft's questions and
-- email template into a new, immutable form version, which becomes the
-- current version. Visitors are only ever served the current version
-- (ADR-0003: the template is versioned together with the questions).

-- The default email template of a new form's draft: Standard Layout, a
-- greeting and the answers table (blueprint §5.2). Placeholders are those of
-- §5.1; the email editor (ticket 17) renders and edits them.
alter table public.forms
  alter column draft_email_template set default jsonb_build_object(
    'mode', 'standard',
    'subject', 'Neue Einsendung: {{form.name}}',
    'body', '<p>Hallo,</p>'
      || '<p>über das Formular „{{form.name}}“ ist am {{submitted_at}} eine neue Einsendung eingegangen:</p>'
      || '{{answers_table}}'
  );

-- Forms created before this migration still have an empty template. Their
-- draft was not edited by anyone, so neither who saved it nor when changes.
alter table public.forms disable trigger forms_stamp_draft;
alter table public.forms disable trigger forms_set_updated_at;
update public.forms
set draft_email_template = default
where draft_email_template = '{}';
alter table public.forms enable trigger forms_stamp_draft;
alter table public.forms enable trigger forms_set_updated_at;

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  -- Versions go with their form only when it is deleted for good (ticket 24).
  form_id uuid not null references public.forms (id) on delete cascade,
  version integer not null check (version > 0),
  schema jsonb not null check (jsonb_typeof(schema) = 'object'),
  email_template jsonb not null check (jsonb_typeof(email_template) = 'object'),
  changelog text
    constraint form_versions_changelog_check
    check (changelog is null or length(changelog) between 1 and 2000),
  -- Null once the account is gone; the version itself stays.
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint form_versions_form_id_version_key unique (form_id, version)
);

comment on table public.form_versions is
  'Immutable snapshots of a form''s questions and email template, numbered 1, 2, 3, ... per form. Written only by public.publish_form().';

-- The current version is always one of the form's versions.
alter table public.forms
  add constraint forms_current_version_fkey
  foreign key (id, current_version)
  references public.form_versions (form_id, version);

-- Signed-in people only read, and RLS narrows that to their teams' forms.
-- Edge functions read the current version with the secret key (ADR-0004).
-- Nobody writes through the Data API: publishing is the only way in.
revoke all on public.form_versions from anon, authenticated, service_role;
grant select on public.form_versions to authenticated, service_role;

alter table public.form_versions enable row level security;

-- The same people who see the form: its team's members and Super Admins.
create policy "Members see their teams' form versions, Super Admins see all"
  on public.form_versions for select
  to authenticated
  using (
    exists (select 1 from public.forms f where f.id = form_versions.form_id)
  );

-- Versions are frozen, even for the table owner. The two exceptions are
-- what other tables' foreign keys do: a deleted account clears `created_by`,
-- and a form deleted for good takes its versions with it.
create function private.keep_form_version_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.created_by is null
     and to_jsonb(new) - 'created_by' = to_jsonb(old) - 'created_by' then
    return new;
  end if;
  if tg_op = 'DELETE'
     and not exists (select 1 from public.forms f where f.id = old.form_id) then
    return old;
  end if;
  raise exception 'form versions are immutable'
    using errcode = 'HF004';
end;
$$;

revoke all on function private.keep_form_version_immutable() from public;

create trigger form_versions_immutable
  before update or delete on public.form_versions
  for each row execute function private.keep_form_version_immutable();

-- Each form's versions are numbered 1, 2, 3, ... without gaps, whichever
-- path inserts them. Publishing locks the form first, so two publishes of
-- the same form cannot race for a number.
create function private.check_form_version_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.version <> coalesce(
       (select max(v.version) from public.form_versions v
        where v.form_id = new.form_id), 0) + 1 then
    raise exception 'form version numbers must be strictly increasing'
      using errcode = 'HF005';
  end if;
  return new;
end;
$$;

revoke all on function private.check_form_version_number() from public;

create trigger form_versions_number
  before insert on public.form_versions
  for each row execute function private.check_form_version_number();

-- Publishing: the draft becomes the next version and the current version,
-- recorded in the audit log, all in one transaction. Open to the members of
-- the form's team and to Super Admins. Returns the new version number.
create function public.publish_form(form uuid, changelog text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
  target public.forms;
  next_version integer;
  note text := nullif(trim(publish_form.changelog), '');
begin
  -- Checked before locking, so nobody can hold another team's form.
  select f.team_id into team from public.forms f where f.id = publish_form.form;
  if team is null
     or not ((select private.is_super_admin())
             or (select private.is_team_member(team))) then
    raise exception 'only the form''s team members and Super Admins may publish it'
      using errcode = 'insufficient_privilege';
  end if;

  -- Locked, so concurrent publishes and draft saves of this form wait.
  select * into target from public.forms f where f.id = publish_form.form
  for update;

  -- SurveyJS keeps questions in `pages[].elements`, or in top-level
  -- `elements` for a single page.
  if not jsonb_path_exists(target.draft_schema, '$.pages[*].elements[*]')
     and not jsonb_path_exists(target.draft_schema, '$.elements[*]') then
    raise exception 'the draft has no questions to publish'
      using errcode = 'HF003';
  end if;

  select coalesce(max(v.version), 0) + 1 into next_version
  from public.form_versions v
  where v.form_id = target.id;

  insert into public.form_versions
    (form_id, version, schema, email_template, changelog, created_by)
  values (
    target.id,
    next_version,
    target.draft_schema,
    target.draft_email_template,
    note,
    (select auth.uid())
  );

  update public.forms set current_version = next_version where id = target.id;

  perform private.record_audit(
    target.team_id, 'form.published', 'form', target.id,
    jsonb_build_object(
      'name', target.name, 'version', next_version, 'changelog', note
    )
  );

  return next_version;
end;
$$;

revoke all on function public.publish_form(uuid, text) from public, anon, service_role;
grant execute on function public.publish_form(uuid, text) to authenticated;

-- NULL is an explicit inheritance choice, including for existing records.
alter table public.forms add column draft_theme jsonb
  check (draft_theme is null or jsonb_typeof(draft_theme) = 'object');
alter table public.form_versions add column theme jsonb
  check (theme is null or jsonb_typeof(theme) = 'object');
comment on column public.forms.draft_theme is
  'Custom SurveyJS appearance in the draft; null inherits the standard appearance.';
comment on column public.form_versions.theme is
  'Published appearance choice; null inherits rather than freezing a default theme.';

grant update (draft_theme) on public.forms to authenticated;

create or replace function private.stamp_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.draft_schema is distinct from new.draft_schema
     or old.draft_email_template is distinct from new.draft_email_template
     or old.draft_theme is distinct from new.draft_theme then
    new.draft_updated_by := auth.uid();
    new.draft_updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_draft() from public;

drop trigger forms_stamp_draft on public.forms;
create trigger forms_stamp_draft
  before update of draft_schema, draft_email_template, draft_theme on public.forms
  for each row execute function private.stamp_draft();

create or replace function public.publish_form(form uuid, changelog text default null)
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
    (form_id, version, schema, email_template, theme, changelog, created_by)
  values (
    target.id,
    next_version,
    target.draft_schema,
    target.draft_email_template,
    target.draft_theme,
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

-- Version history (blueprint §3): a team member restores any form version
-- into the draft, to publish it again as a new version, or discards the
-- draft's unpublished changes by resetting it to the current version. Both
-- only write the draft, so versions stay immutable and their numbers keep
-- increasing; publishing a restored draft makes the next version. Both are
-- recorded in the audit log, in the same transaction.

-- Copies a version's questions and email template into the form's draft.
-- private.stamp_draft() stamps the caller, as for any draft save. Open to
-- the members of the form's team and to Super Admins.
create or replace function public.restore_form_version(form uuid, version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
  target public.forms;
  restored public.form_versions;
begin
  -- Checked before locking, so nobody can hold another team's form.
  select f.team_id into team from public.forms f
  where f.id = restore_form_version.form;
  if team is null
     or not ((select private.is_super_admin())
             or (select private.is_team_member(team))) then
    raise exception 'only the form''s team members and Super Admins may restore its versions'
      using errcode = 'insufficient_privilege';
  end if;

  -- Locked, so a concurrent publish freezes either the old or the restored
  -- draft, never a mix.
  select * into target from public.forms f
  where f.id = restore_form_version.form
  for update;

  select * into restored from public.form_versions v
  where v.form_id = target.id and v.version = restore_form_version.version;
  if not found then
    raise exception 'the form has no version %', restore_form_version.version
      using errcode = 'HF007';
  end if;

  update public.forms
  set draft_schema = restored.schema,
      draft_email_template = restored.email_template,
      draft_theme = restored.theme
  where id = target.id;

  perform private.record_audit(
    target.team_id, 'form.version_restored', 'form', target.id,
    jsonb_build_object('name', target.name, 'version', restored.version)
  );
end;
$$;

revoke all on function public.restore_form_version(uuid, integer) from public, anon, service_role;
grant execute on function public.restore_form_version(uuid, integer) to authenticated;

-- Resets the form's draft to its current version, throwing away the
-- unpublished changes. Refused while the form is not yet published, since
-- there is nothing to reset to. Open to the same people as restoring.
create or replace function public.discard_draft_changes(form uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
  target public.forms;
  reset_to public.form_versions;
begin
  select f.team_id into team from public.forms f
  where f.id = discard_draft_changes.form;
  if team is null
     or not ((select private.is_super_admin())
             or (select private.is_team_member(team))) then
    raise exception 'only the form''s team members and Super Admins may discard its draft changes'
      using errcode = 'insufficient_privilege';
  end if;

  select * into target from public.forms f
  where f.id = discard_draft_changes.form
  for update;

  if target.current_version is null then
    raise exception 'the form is not yet published, so there is no version to reset the draft to'
      using errcode = 'HF008';
  end if;

  select * into reset_to from public.form_versions v
  where v.form_id = target.id and v.version = target.current_version;

  update public.forms
  set draft_schema = reset_to.schema,
      draft_email_template = reset_to.email_template,
      draft_theme = reset_to.theme
  where id = target.id;

  perform private.record_audit(
    target.team_id, 'form.draft_discarded', 'form', target.id,
    jsonb_build_object('name', target.name, 'version', reset_to.version)
  );
end;
$$;

revoke all on function public.discard_draft_changes(uuid) from public, anon, service_role;
grant execute on function public.discard_draft_changes(uuid) to authenticated;

drop function public.load_form(uuid);

create function public.load_form(form uuid)
returns table (
  version integer,
  schema jsonb,
  access_type public.form_access_type,
  turnstile_enabled boolean,
  is_closed boolean,
  theme jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.version, v.schema, f.access_type, f.turnstile_enabled, f.is_closed, v.theme
  from public.forms f
  join public.form_versions v
    on v.form_id = f.id and v.version = f.current_version
  where f.id = load_form.form
    and f.archived_at is null;
$$;

revoke all on function public.load_form(uuid) from public, anon, authenticated;
grant execute on function public.load_form(uuid) to service_role;

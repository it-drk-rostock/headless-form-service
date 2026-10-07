-- Version history (blueprint §3): a team member restores any form version
-- into the draft, to publish it again as a new version, or discards the
-- draft's unpublished changes by resetting it to the current version. Both
-- only write the draft, so versions stay immutable and their numbers keep
-- increasing; publishing a restored draft makes the next version. Both are
-- recorded in the audit log, in the same transaction.

-- Copies a version's questions and email template into the form's draft.
-- private.stamp_draft() stamps the caller, as for any draft save. Open to
-- the members of the form's team and to Super Admins.
create function public.restore_form_version(form uuid, version integer)
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
      draft_email_template = restored.email_template
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
create function public.discard_draft_changes(form uuid)
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
      draft_email_template = reset_to.email_template
  where id = target.id;

  perform private.record_audit(
    target.team_id, 'form.draft_discarded', 'form', target.id,
    jsonb_build_object('name', target.name, 'version', reset_to.version)
  );
end;
$$;

revoke all on function public.discard_draft_changes(uuid) from public, anon, service_role;
grant execute on function public.discard_draft_changes(uuid) to authenticated;

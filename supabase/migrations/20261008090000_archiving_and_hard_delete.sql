-- Archiving and hard delete (blueprint §2.1, §3): a team member archives a
-- form that is no longer needed. It is hidden from lists, `/load-form` and
-- `/submit-form` refuse it (load_form and submission_form already skip
-- archived forms), and its versions and statistics stay. Archiving can be
-- undone. Only a Super Admin deletes a form for good, which takes its
-- versions, statistics and load counts with it. Both are recorded in the
-- audit log, in the same transaction.

comment on column public.forms.archived_at is
  'When the form was archived: hidden from lists, refuses loads and submissions, keeps versions and statistics. Null while in use.';

-- Archives the form, keeping the first archiving time if it already is.
-- Open to the members of the form's team and to Super Admins, like closing.
-- A function rather than a column grant, so nobody picks the time.
create function public.archive_form(form uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
begin
  select f.team_id into team from public.forms f where f.id = archive_form.form;
  if team is null
     or not ((select private.is_super_admin())
             or (select private.is_team_member(team))) then
    raise exception 'only the form''s team members and Super Admins may archive it'
      using errcode = 'insufficient_privilege';
  end if;

  update public.forms
  set archived_at = now()
  where id = archive_form.form and archived_at is null;
end;
$$;

revoke all on function public.archive_form(uuid) from public, anon, service_role;
grant execute on function public.archive_form(uuid) to authenticated;

-- Takes the form out of the archive; it is served again at once.
create function public.unarchive_form(form uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
begin
  select f.team_id into team from public.forms f where f.id = unarchive_form.form;
  if team is null
     or not ((select private.is_super_admin())
             or (select private.is_team_member(team))) then
    raise exception 'only the form''s team members and Super Admins may unarchive it'
      using errcode = 'insufficient_privilege';
  end if;

  update public.forms
  set archived_at = null
  where id = unarchive_form.form and archived_at is not null;
end;
$$;

revoke all on function public.unarchive_form(uuid) from public, anon, service_role;
grant execute on function public.unarchive_form(uuid) to authenticated;

-- Deletes the form for good, Super Admins only (blueprint §2.1). Its
-- versions, statistics and load counts go with it (foreign keys cascade);
-- its audit log entries stay. Nobody deletes forms through the Data API.
create function public.delete_form(form uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_super_admin()) then
    raise exception 'only Super Admins may delete forms'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.forms where id = delete_form.form;
  if not found then
    raise exception 'there is no form %', delete_form.form
      using errcode = 'HF009';
  end if;
end;
$$;

revoke all on function public.delete_form(uuid) from public, anon, service_role;
grant execute on function public.delete_form(uuid) to authenticated;

-- Archiving, unarchiving and deleting are audited (blueprint §3), whichever
-- path made the change.
create or replace function private.audit_form_change()
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

  if tg_op = 'DELETE' then
    perform private.record_audit(
      old.team_id, 'form.deleted', 'form', old.id,
      jsonb_build_object('name', old.name)
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
  if old.turnstile_enabled is distinct from new.turnstile_enabled then
    perform private.record_audit(
      new.team_id, 'form.turnstile_changed', 'form', new.id,
      jsonb_build_object('name', new.name, 'enabled', new.turnstile_enabled)
    );
  end if;
  if old.reply_to_question is distinct from new.reply_to_question then
    perform private.record_audit(
      new.team_id, 'form.reply_to_changed', 'form', new.id,
      jsonb_build_object(
        'name', new.name,
        'from', old.reply_to_question,
        'to', new.reply_to_question
      )
    );
  end if;
  if old.sender_display_name is distinct from new.sender_display_name then
    perform private.record_audit(
      new.team_id, 'form.sender_name_changed', 'form', new.id,
      jsonb_build_object(
        'name', new.name,
        'from', old.sender_display_name,
        'to', new.sender_display_name
      )
    );
  end if;
  if old.is_closed is distinct from new.is_closed then
    perform private.record_audit(
      new.team_id,
      case when new.is_closed then 'form.closed' else 'form.reopened' end,
      'form', new.id,
      jsonb_build_object('name', new.name)
    );
  end if;
  if (old.archived_at is null) is distinct from (new.archived_at is null) then
    perform private.record_audit(
      new.team_id,
      case when new.archived_at is null then 'form.unarchived' else 'form.archived' end,
      'form', new.id,
      jsonb_build_object('name', new.name)
    );
  end if;
  return null;
end;
$$;

drop trigger forms_audit_settings_change on public.forms;

create trigger forms_audit_settings_change
  after update of name, recipients, turnstile_enabled, reply_to_question,
    sender_display_name, is_closed, archived_at on public.forms
  for each row
  when (old.name is distinct from new.name
        or old.recipients is distinct from new.recipients
        or old.turnstile_enabled is distinct from new.turnstile_enabled
        or old.reply_to_question is distinct from new.reply_to_question
        or old.sender_display_name is distinct from new.sender_display_name
        or old.is_closed is distinct from new.is_closed
        or (old.archived_at is null) is distinct from (new.archived_at is null))
  execute function private.audit_form_change();

create trigger forms_audit_delete
  after delete on public.forms
  for each row execute function private.audit_form_change();

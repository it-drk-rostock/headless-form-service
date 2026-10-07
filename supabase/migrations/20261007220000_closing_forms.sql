-- Closing forms (blueprint §3, §4.1, §4.2): a team member closes a form for
-- a while. Its embed shows a closed notice and `/submit-form` refuses
-- submissions until it is reopened. `forms.is_closed` lives on the form, not
-- the version, so it takes effect at once, also for visitors who loaded the
-- form before. Submissions accepted before closing are still delivered.

comment on column public.forms.is_closed is
  'Closed: the embed shows a closed notice and submissions are refused. Takes effect at once.';

-- Members of the owning team and Super Admins close and reopen it in the
-- form's settings; the forms update policy already limits the rows.
grant update (is_closed) on public.forms to authenticated;

-- Closing and reopening are audited (blueprint §3).
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
  return null;
end;
$$;

drop trigger forms_audit_settings_change on public.forms;

create trigger forms_audit_settings_change
  after update of name, recipients, turnstile_enabled, reply_to_question,
    sender_display_name, is_closed on public.forms
  for each row
  when (old.name is distinct from new.name
        or old.recipients is distinct from new.recipients
        or old.turnstile_enabled is distinct from new.turnstile_enabled
        or old.reply_to_question is distinct from new.reply_to_question
        or old.sender_display_name is distinct from new.sender_display_name
        or old.is_closed is distinct from new.is_closed)
  execute function private.audit_form_change();

-- `/load-form` answers a closed form with its closed state instead of its
-- questions. A changed result type needs drop and create.
drop function public.load_form(uuid);

create function public.load_form(form uuid)
returns table (
  version integer,
  schema jsonb,
  access_type public.form_access_type,
  turnstile_enabled boolean,
  is_closed boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.version, v.schema, f.access_type, f.turnstile_enabled, f.is_closed
  from public.forms f
  join public.form_versions v
    on v.form_id = f.id and v.version = f.current_version
  where f.id = load_form.form
    and f.archived_at is null;
$$;

revoke all on function public.load_form(uuid) from public, anon, authenticated;
grant execute on function public.load_form(uuid) to service_role;

-- `/submit-form` refuses submissions to a closed form, also from visitors
-- who loaded it before it was closed.
drop function public.submission_form(uuid, integer);

create function public.submission_form(form uuid, version integer)
returns table (
  schema jsonb,
  access_type public.form_access_type,
  turnstile_enabled boolean,
  is_closed boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.schema, f.access_type, f.turnstile_enabled, f.is_closed
  from public.forms f
  join public.form_versions v
    on v.form_id = f.id and v.version = submission_form.version
  where f.id = submission_form.form
    and f.current_version is not null
    and f.archived_at is null;
$$;

revoke all on function public.submission_form(uuid, integer) from public, anon, authenticated;
grant execute on function public.submission_form(uuid, integer) to service_role;

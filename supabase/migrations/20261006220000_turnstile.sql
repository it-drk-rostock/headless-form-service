-- Bot protection (blueprint §4.1, §4.2): each form switches Cloudflare
-- Turnstile on or off (`forms.turnstile_enabled`, default on). The setting
-- lives on the form, not the version, so it takes effect at once, also for
-- visitors who loaded the form before.

-- Members of the owning team and Super Admins switch it in the form's
-- settings; the forms update policy already limits the rows.
grant update (turnstile_enabled) on public.forms to authenticated;

-- Switching it is a form-setting change, so it is audited (blueprint §3).
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
  return null;
end;
$$;

drop trigger forms_audit_settings_change on public.forms;

create trigger forms_audit_settings_change
  after update of name, recipients, turnstile_enabled on public.forms
  for each row
  when (old.name is distinct from new.name
        or old.recipients is distinct from new.recipients
        or old.turnstile_enabled is distinct from new.turnstile_enabled)
  execute function private.audit_form_change();

-- `/load-form` hands out the widget's site key only for forms with Turnstile
-- on. A changed result type needs drop and create.
drop function public.load_form(uuid);

create function public.load_form(form uuid)
returns table (
  version integer,
  schema jsonb,
  access_type public.form_access_type,
  turnstile_enabled boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.version, v.schema, f.access_type, f.turnstile_enabled
  from public.forms f
  join public.form_versions v
    on v.form_id = f.id and v.version = f.current_version
  where f.id = load_form.form
    and f.archived_at is null;
$$;

revoke all on function public.load_form(uuid) from public, anon, authenticated;
grant execute on function public.load_form(uuid) to service_role;

-- `/submit-form` verifies a Turnstile token only for forms with it on.
drop function public.submission_form(uuid, integer);

create function public.submission_form(form uuid, version integer)
returns table (
  schema jsonb,
  access_type public.form_access_type,
  turnstile_enabled boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.schema, f.access_type, f.turnstile_enabled
  from public.forms f
  join public.form_versions v
    on v.form_id = f.id and v.version = submission_form.version
  where f.id = submission_form.form
    and f.current_version is not null
    and f.archived_at is null;
$$;

revoke all on function public.submission_form(uuid, integer) from public, anon, authenticated;
grant execute on function public.submission_form(uuid, integer) to service_role;

-- Reply-To question and sender display name (blueprint §3, §4.4): staff
-- reply straight to the person who filled in the form, and each form names
-- itself next to the global sender address. Both live on the form, not the
-- version, so they take effect at once, also for submissions already queued
-- (ADR-0003).

-- No question is null, never empty. The dashboard offers only the email
-- questions of the current version; the dispatcher sets Reply-To only when
-- the answer is a valid address, so a setting a newer version no longer
-- matches does no harm.
alter table public.forms
  add constraint forms_reply_to_question_check
  check (reply_to_question <> '');

-- The name goes into the From header: one line, no control characters.
alter table public.forms
  add constraint forms_sender_display_name_line_check
  check (sender_display_name !~ '[[:cntrl:]]');

comment on column public.forms.reply_to_question is
  'Answer key of the question whose answer becomes Reply-To, if it is a valid email address. Null: replies go to the sender.';
comment on column public.forms.sender_display_name is
  'Shown with the global sender address. Empty: the service''s own name.';

-- Members of the owning team and Super Admins change both in the form's
-- settings; the forms update policy already limits the rows.
grant update (reply_to_question, sender_display_name) on public.forms to authenticated;

-- Both are form-setting changes, so they are audited (blueprint §3).
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
  return null;
end;
$$;

drop trigger forms_audit_settings_change on public.forms;

create trigger forms_audit_settings_change
  after update of name, recipients, turnstile_enabled, reply_to_question,
    sender_display_name on public.forms
  for each row
  when (old.name is distinct from new.name
        or old.recipients is distinct from new.recipients
        or old.turnstile_enabled is distinct from new.turnstile_enabled
        or old.reply_to_question is distinct from new.reply_to_question
        or old.sender_display_name is distinct from new.sender_display_name)
  execute function private.audit_form_change();

-- `/dispatch-email` also needs the sender display name and the Reply-To
-- question, both as the form has them now. A changed result type needs drop
-- and create.
drop function public.dispatch_submission(uuid, uuid, integer);

create function public.dispatch_submission(
  submission uuid,
  form uuid,
  version integer
)
returns table (
  form_name text,
  recipients text[],
  schema jsonb,
  email_template jsonb,
  submitted_at timestamptz,
  status public.submission_status,
  sender_display_name text,
  reply_to_question text
)
language sql
stable
-- `form_stats` has no grants, not even for the secret key.
security definer
set search_path = ''
as $$
  select
    f.name,
    f.recipients::text[],
    v.schema,
    v.email_template,
    coalesce(s.submitted_at, now()),
    s.status,
    f.sender_display_name,
    f.reply_to_question
  from public.form_versions v
  join public.forms f on f.id = v.form_id
  left join public.form_stats s
    on s.id = dispatch_submission.submission
   and s.form_id = v.form_id
   and s.version = v.version
  where v.form_id = dispatch_submission.form
    and v.version = dispatch_submission.version;
$$;

-- Only `/dispatch-email`, through the secret key.
revoke all on function public.dispatch_submission(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.dispatch_submission(uuid, uuid, integer) to service_role;

-- Form passes in the dashboard (blueprint §3, §7): team members make a form
-- protected, set its form page, and create form passes for it. The secret
-- is made and shown by the dashboard only once; the database keeps its
-- SHA-256 hash. Passes are listed and revoked in the dashboard. Creating and
-- revoking are recorded in the audit log, in the same transaction.
-- `/load-form` and `/submit-form` check passes from ticket 26 on, and n8n
-- creates them through `/generate-form-pass` (ticket 29).

comment on column public.forms.access_type is
  'public: anyone can fill it in. protected: only with a valid form pass.';
comment on column public.forms.page_url is
  'The form page: the website page hosting the embed, used to build form pass links. Null while unset.';

-- A web address, as the dashboard stores it (parseFormPage in lib/forms/passes.ts).
alter table public.forms
  add constraint forms_page_url_check
  check (page_url is null
         or (length(page_url) <= 2000 and page_url ~ '^https?://[^[:space:]]+$'));

-- Members of the owning team and Super Admins set both in the form's
-- settings; the forms update policy already limits the rows.
grant update (access_type, page_url) on public.forms to authenticated;

create type public.form_pass_source as enum ('dashboard', 'n8n');

-- Pass metadata (GLOSSARY): a flat object of at most 20 string or number
-- values, under keys a `{{pass.<key>}}` placeholder can name. Same rules as
-- lib/shared/form-pass.ts.
create function private.is_pass_metadata(metadata jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(metadata) = 'object'
    and (select count(*) from jsonb_object_keys(metadata)) <= 20
    and not exists (
      select 1
      from jsonb_each(metadata) e
      where e.key !~ '^[A-Za-z0-9_-]{1,50}$'
         or not (jsonb_typeof(e.value) = 'number'
                 or (jsonb_typeof(e.value) = 'string'
                     and length(e.value #>> '{}') <= 500))
    )
$$;

create table public.form_passes (
  id uuid primary key default gen_random_uuid(),
  -- Passes go with their form when it is deleted for good.
  form_id uuid not null references public.forms (id) on delete cascade,
  -- SHA-256 of the secret, lower-case hex. The secret itself is never stored.
  token_hash text not null unique
    constraint form_passes_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$'),
  -- Null: unlimited until expiry. 1: single-use.
  max_uses integer constraint form_passes_max_uses_check check (max_uses > 0),
  use_count integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  source public.form_pass_source not null,
  created_by uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'
    constraint form_passes_metadata_check check (private.is_pass_metadata(metadata)),
  created_at timestamptz not null default now(),
  constraint form_passes_use_count_check
    check (use_count >= 0 and (max_uses is null or use_count <= max_uses)),
  constraint form_passes_expires_at_check
    check (expires_at is null or expires_at > created_at)
);

comment on table public.form_passes is
  'Form passes: secret, link-borne permissions to fill in one protected form. Valid while not revoked, not expired, and max_uses is null or use_count < max_uses.';
comment on column public.form_passes.metadata is
  'Pass metadata: flat string or number values carried into the notification email. Never personal data.';

-- A form's passes, newest first, as the dashboard lists them.
create index form_passes_form_id_idx on public.form_passes (form_id, created_at desc);
-- Who created a pass, for the profiles foreign key.
create index form_passes_created_by_idx on public.form_passes (created_by);

-- The anon role has no access (ADR-0004). Signed-in people read everything
-- but the hash, and write only through create_form_pass and
-- revoke_form_pass. `/generate-form-pass` (ticket 29) and the pass checks of
-- `/load-form` and `/submit-form` (tickets 26, 27) use the secret key.
revoke all on public.form_passes from anon, authenticated;
grant select (id, form_id, max_uses, use_count, expires_at, revoked_at,
  source, created_by, metadata, created_at)
  on public.form_passes to authenticated;

alter table public.form_passes enable row level security;

create policy "Members see their teams' form passes, Super Admins see all"
  on public.form_passes for select
  to authenticated
  using (
    exists (select 1 from public.forms f where f.id = form_passes.form_id)
  );

-- Creates a form pass for a protected form, from the dashboard, and returns
-- its ID. The dashboard makes the secret and passes only its hash. Open to
-- the members of the form's team and to Super Admins.
create function public.create_form_pass(
  form uuid,
  token_hash text,
  max_uses integer default 1,
  expires_at timestamptz default null,
  metadata jsonb default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
  access public.form_access_type;
  pass uuid;
begin
  select f.team_id, f.access_type into team, access
  from public.forms f where f.id = create_form_pass.form;
  if team is null
     or not ((select private.is_super_admin())
             or (select private.is_team_member(team))) then
    raise exception 'only the form''s team members and Super Admins may create its form passes'
      using errcode = 'insufficient_privilege';
  end if;
  if access <> 'protected' then
    raise exception 'form % is not protected', create_form_pass.form
      using errcode = 'HF010';
  end if;

  insert into public.form_passes
    (form_id, token_hash, max_uses, expires_at, source, created_by, metadata)
  values (
    create_form_pass.form,
    create_form_pass.token_hash,
    create_form_pass.max_uses,
    create_form_pass.expires_at,
    'dashboard',
    (select auth.uid()),
    coalesce(create_form_pass.metadata, '{}')
  )
  returning id into pass;
  return pass;
end;
$$;

revoke all on function public.create_form_pass(uuid, text, integer, timestamptz, jsonb)
  from public, anon, service_role;
grant execute on function public.create_form_pass(uuid, text, integer, timestamptz, jsonb)
  to authenticated;

-- Revokes a form pass for good, keeping the first revocation time. Open to
-- the members of the form's team and to Super Admins. A function rather
-- than a column grant, so nobody picks the time or takes it back.
create function public.revoke_form_pass(pass uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid;
begin
  select f.team_id into team
  from public.form_passes p
  join public.forms f on f.id = p.form_id
  where p.id = revoke_form_pass.pass;
  if team is null
     or not ((select private.is_super_admin())
             or (select private.is_team_member(team))) then
    raise exception 'only the form''s team members and Super Admins may revoke its form passes'
      using errcode = 'insufficient_privilege';
  end if;

  update public.form_passes
  set revoked_at = now()
  where id = revoke_form_pass.pass and revoked_at is null;
end;
$$;

revoke all on function public.revoke_form_pass(uuid) from public, anon, service_role;
grant execute on function public.revoke_form_pass(uuid) to authenticated;

-- Creating and revoking passes are audited (blueprint §3), whichever path
-- made them. Neither the hash nor the metadata goes into the log.
create function private.audit_form_pass_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  form_team uuid;
  form_name text;
begin
  select f.team_id, f.name into form_team, form_name
  from public.forms f where f.id = new.form_id;

  if tg_op = 'INSERT' then
    perform private.record_audit(
      form_team, 'form_pass.created', 'form_pass', new.id,
      jsonb_build_object(
        'name', form_name,
        'max_uses', new.max_uses,
        'expires_at', new.expires_at,
        'source', new.source
      )
    );
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform private.record_audit(
      form_team, 'form_pass.revoked', 'form_pass', new.id,
      jsonb_build_object('name', form_name)
    );
  end if;
  return null;
end;
$$;

revoke all on function private.audit_form_pass_change() from public;

create trigger form_passes_audit_insert
  after insert on public.form_passes
  for each row execute function private.audit_form_pass_change();

create trigger form_passes_audit_revoke
  after update of revoked_at on public.form_passes
  for each row
  when (old.revoked_at is null and new.revoked_at is not null)
  execute function private.audit_form_pass_change();

-- Access type and form page changes are audited like the other settings.
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
  if old.page_url is distinct from new.page_url then
    perform private.record_audit(
      new.team_id, 'form.page_changed', 'form', new.id,
      jsonb_build_object('name', new.name, 'from', old.page_url, 'to', new.page_url)
    );
  end if;
  if old.access_type is distinct from new.access_type then
    perform private.record_audit(
      new.team_id, 'form.access_changed', 'form', new.id,
      jsonb_build_object('name', new.name, 'to', new.access_type)
    );
  end if;
  return null;
end;
$$;

drop trigger forms_audit_settings_change on public.forms;

create trigger forms_audit_settings_change
  after update of name, recipients, turnstile_enabled, reply_to_question,
    sender_display_name, is_closed, archived_at, page_url, access_type
  on public.forms
  for each row
  when (old.name is distinct from new.name
        or old.recipients is distinct from new.recipients
        or old.turnstile_enabled is distinct from new.turnstile_enabled
        or old.reply_to_question is distinct from new.reply_to_question
        or old.sender_display_name is distinct from new.sender_display_name
        or old.is_closed is distinct from new.is_closed
        or (old.archived_at is null) is distinct from (new.archived_at is null)
        or old.page_url is distinct from new.page_url
        or old.access_type is distinct from new.access_type)
  execute function private.audit_form_change();

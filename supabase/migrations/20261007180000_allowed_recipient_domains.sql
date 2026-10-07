-- Allowed recipient domains (blueprint §3, GLOSSARY): submissions must not be
-- redirected to private mailboxes. A Super Admin keeps the list on the
-- settings page; a form's recipients must each be on a listed domain, and
-- `/dispatch-email` sends to nobody else (defence in depth).

-- Domains in lower case, at least two labels of letters, digits and hyphens,
-- each once by the dashboard's doing. Domains contain no spaces, so the list
-- is checked joined by spaces. Same rule as lib/settings/recipient-domains.ts.
alter table public.settings
  add column allowed_recipient_domains text[] not null default '{}'
    constraint settings_allowed_recipient_domains_check
    check (
      array_position(allowed_recipient_domains, null) is null
      and array_position(allowed_recipient_domains, '') is null
      and cardinality(allowed_recipient_domains) <= 100
      and array_to_string(allowed_recipient_domains, ' ') ~
        '^([a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+( [a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+)*)?$'
    );

comment on column public.settings.allowed_recipient_domains is
  'Email domains a form''s recipients must belong to, exactly (a subdomain is its own entry).';

-- The DRK Rostock's own domain. A form whose recipients are elsewhere keeps
-- them, but cannot save a changed list until they are fixed, and gets no
-- email to them (README, "Global settings").
update public.settings
set allowed_recipient_domains = array['drk-rostock.de'];

grant update (allowed_recipient_domains) on public.settings to authenticated;

-- Every recipient must be on an allowed domain, checked whenever a form's
-- recipient list changes, also for writes that bypass the dashboard.
-- `public.email_address` guarantees lower case and a single `@`, so the part
-- after it is the domain (lib/shared/recipient-domains.ts). Reads the settings as
-- its owner, since only Super Admins may. Fails with SQLSTATE HF006 and the
-- first refused address as detail, so the dashboard can name it.
create function private.check_recipient_domains()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  refused text;
begin
  if tg_op = 'UPDATE' and old.recipients is not distinct from new.recipients then
    return new;
  end if;
  select e.address into refused
  from unnest(new.recipients::text[]) with ordinality as e (address, position)
  where not split_part(e.address, '@', 2) = any (
    coalesce(
      (select s.allowed_recipient_domains from public.settings s),
      '{}'
    )
  )
  order by e.position
  limit 1;
  if refused is not null then
    raise exception 'recipient % is not on an allowed recipient domain', refused
      using errcode = 'HF006', detail = refused;
  end if;
  return new;
end;
$$;

revoke all on function private.check_recipient_domains() from public;

create trigger forms_check_recipient_domains
  before insert or update of recipients on public.forms
  for each row execute function private.check_recipient_domains();

-- Audit the new setting like the others (ticket 20).
create or replace function private.audit_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.allowed_origins is distinct from new.allowed_origins then
    perform private.record_audit(
      null, 'settings.origins_changed', 'settings', null,
      jsonb_build_object(
        'from', to_jsonb(old.allowed_origins),
        'to', to_jsonb(new.allowed_origins)
      )
    );
  end if;
  if old.allowed_recipient_domains is distinct from new.allowed_recipient_domains then
    perform private.record_audit(
      null, 'settings.recipient_domains_changed', 'settings', null,
      jsonb_build_object(
        'from', to_jsonb(old.allowed_recipient_domains),
        'to', to_jsonb(new.allowed_recipient_domains)
      )
    );
  end if;
  if old.load_rate_limit is distinct from new.load_rate_limit then
    perform private.record_audit(
      null, 'settings.load_limit_changed', 'settings', null,
      jsonb_build_object('from', old.load_rate_limit, 'to', new.load_rate_limit)
    );
  end if;
  if old.submit_rate_limit is distinct from new.submit_rate_limit then
    perform private.record_audit(
      null, 'settings.submit_limit_changed', 'settings', null,
      jsonb_build_object(
        'from', old.submit_rate_limit,
        'to', new.submit_rate_limit
      )
    );
  end if;
  return null;
end;
$$;

drop trigger settings_audit_change on public.settings;

create trigger settings_audit_change
  after update of
    allowed_origins, allowed_recipient_domains, load_rate_limit, submit_rate_limit
  on public.settings
  for each row
  when (old.allowed_origins is distinct from new.allowed_origins
        or old.allowed_recipient_domains is distinct from new.allowed_recipient_domains
        or old.load_rate_limit is distinct from new.load_rate_limit
        or old.submit_rate_limit is distinct from new.submit_rate_limit)
  execute function private.audit_settings_change();

-- `/dispatch-email` also gets the allowed domains, and sends only to
-- recipients on them: the list may have shrunk since the form was saved.
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
  reply_to_question text,
  allowed_recipient_domains text[]
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
    f.reply_to_question,
    coalesce(
      (select g.allowed_recipient_domains from public.settings g),
      '{}'
    )
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

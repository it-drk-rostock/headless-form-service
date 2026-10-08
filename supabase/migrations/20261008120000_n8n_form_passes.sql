-- Form passes from n8n (blueprint §7, ADR-0005): `/generate-form-pass`
-- checks n8n's integration key, makes the secret and passes only its hash
-- here. n8n never gets the secret key itself. The audit trigger on
-- form_passes records the creation with source n8n and no actor.

-- Creates an n8n form pass for a protected form and returns the form page,
-- or null when none is set. An unknown or archived form raises HF011, a
-- public one HF010 (as create_form_pass).
create function public.create_n8n_form_pass(
  form uuid,
  token_hash text,
  max_uses integer,
  expires_at timestamptz,
  metadata jsonb
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  access public.form_access_type;
  page text;
begin
  select f.access_type, f.page_url into access, page
  from public.forms f
  where f.id = create_n8n_form_pass.form and f.archived_at is null;
  if not found then
    raise exception 'form % does not exist or is archived', create_n8n_form_pass.form
      using errcode = 'HF011';
  end if;
  if access <> 'protected' then
    raise exception 'form % is not protected', create_n8n_form_pass.form
      using errcode = 'HF010';
  end if;

  insert into public.form_passes
    (form_id, token_hash, max_uses, expires_at, source, metadata)
  values (
    create_n8n_form_pass.form,
    create_n8n_form_pass.token_hash,
    create_n8n_form_pass.max_uses,
    create_n8n_form_pass.expires_at,
    'n8n',
    coalesce(create_n8n_form_pass.metadata, '{}')
  );
  return page;
end;
$$;

-- Only `/generate-form-pass`, through the secret key (ADR-0004, ADR-0005).
revoke all on function public.create_n8n_form_pass(uuid, text, integer, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_n8n_form_pass(uuid, text, integer, timestamptz, jsonb)
  to service_role;

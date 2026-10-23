-- Personal prefill and routing data are encrypted by the edge function.
-- Existing authenticated grants enumerate columns and do not expose this one.
alter table public.form_passes add column encrypted_context jsonb;
comment on column public.form_passes.encrypted_context is
  'AES-256-GCM encrypted personal prefill and recipient, bound to form and token hash. Retained until the pass or form is deleted.';

-- Keep the existing five-argument API working. Create and attach the context
-- in one transaction, so a failed write never leaves a usable partial pass.
create function public.create_personalized_n8n_form_pass(
  form uuid, token_hash text, max_uses integer, expires_at timestamptz,
  metadata jsonb, encrypted_context jsonb
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare page text;
begin
  if encrypted_context is null or jsonb_typeof(encrypted_context) <> 'object'
    or encrypted_context->>'v' is distinct from '1'
    or not (encrypted_context ?& array['kid', 'iv', 'ct']) then
    raise exception 'invalid encrypted pass context' using errcode = '22023';
  end if;
  page := public.create_n8n_form_pass(form, token_hash, max_uses, expires_at, metadata);
  update public.form_passes p
  set encrypted_context = create_personalized_n8n_form_pass.encrypted_context
  where p.form_id = form and p.token_hash = create_personalized_n8n_form_pass.token_hash;
  return page;
end;
$$;
revoke all on function public.create_personalized_n8n_form_pass(uuid, text, integer, timestamptz, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_personalized_n8n_form_pass(uuid, text, integer, timestamptz, jsonb, jsonb)
  to service_role;

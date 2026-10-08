-- Protected submission (blueprint §4.2): one pass use per submission,
-- including concurrent retries. Keep only IDs and attempt state, never
-- the visitor's answers or secret. These rows live as long as their pass.
create table private.form_pass_claims (
  submission_id uuid primary key,
  pass_id uuid not null references public.form_passes (id) on delete cascade,
  active_attempts integer not null default 0 check (active_attempts >= 0),
  accepted boolean not null default false
);
create index form_pass_claims_pass_id_idx on private.form_pass_claims (pass_id);
alter table private.form_pass_claims enable row level security;
revoke all on private.form_pass_claims from public, anon, authenticated, service_role;

-- Locks the submission reservation and pass together. Different submission
-- IDs compete for the pass's uses; retries of the same ID share one use.
-- NO KEY UPDATE also permits the FK's KEY SHARE lock from a competing insert.
create function public.claim_form_pass(form uuid, token_hash text, submission uuid)
returns table (id uuid, metadata jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation record;
begin
  insert into private.form_pass_claims (submission_id, pass_id)
  select claim_form_pass.submission, p.id
  from public.form_passes p
  where p.form_id = claim_form_pass.form
    and p.token_hash = claim_form_pass.token_hash
    and p.revoked_at is null
    and (p.expires_at is null or p.expires_at > clock_timestamp())
  on conflict (submission_id) do nothing;

  select c.active_attempts, c.accepted, p.id, p.metadata into reservation
  from private.form_pass_claims c
  join public.form_passes p on p.id = c.pass_id
  where c.submission_id = claim_form_pass.submission
    and p.form_id = claim_form_pass.form
    and p.token_hash = claim_form_pass.token_hash
    and p.revoked_at is null
    and (p.expires_at is null or p.expires_at > clock_timestamp())
  for no key update of c, p;
  if not found then
    delete from private.form_pass_claims c
    where c.submission_id = claim_form_pass.submission
      and c.active_attempts = 0 and not c.accepted;
    return;
  end if;

  if reservation.active_attempts = 0 and not reservation.accepted then
    update public.form_passes p
    set use_count = p.use_count + 1
    where p.id = reservation.id
      and p.revoked_at is null
      and (p.expires_at is null or p.expires_at > clock_timestamp())
      and (p.max_uses is null or p.use_count < p.max_uses);
    if not found then
      delete from private.form_pass_claims c
      where c.submission_id = claim_form_pass.submission;
      return;
    end if;
  end if;

  update private.form_pass_claims c
  set active_attempts = c.active_attempts + 1
  where c.submission_id = claim_form_pass.submission;
  return query select reservation.id::uuid, reservation.metadata::jsonb;
end;
$$;

-- Only `/submit-form`, through the secret key (ADR-0004).
revoke all on function public.claim_form_pass(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_form_pass(uuid, text, uuid) to service_role;

-- Keep the use if any attempt published successfully. Release it only when
-- all overlapping attempts failed; one failure cannot undo another's success.
create function public.finish_form_pass_claim(submission uuid, accepted boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  reservation private.form_pass_claims;
begin
  select c.* into reservation
  from private.form_pass_claims c
  where c.submission_id = finish_form_pass_claim.submission
  for update;
  if not found or reservation.active_attempts = 0 then return; end if;

  update private.form_pass_claims c
  set active_attempts = c.active_attempts - 1,
      accepted = c.accepted or coalesce(finish_form_pass_claim.accepted, false)
  where c.submission_id = finish_form_pass_claim.submission
  returning c.* into reservation;

  if reservation.active_attempts = 0 and not reservation.accepted then
    delete from private.form_pass_claims c
    where c.submission_id = finish_form_pass_claim.submission;
    update public.form_passes p
    set use_count = p.use_count - 1
    where p.id = reservation.pass_id and p.use_count > 0;
  end if;
end;
$$;

revoke all on function public.finish_form_pass_claim(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.finish_form_pass_claim(uuid, boolean) to service_role;

-- A failed attempt must not remove another attempt's in-flight or accepted
-- stats row. A protected claim disappears only after every attempt failed.
create or replace function public.unqueue_submission(submission uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.form_stats s
  where s.id = unqueue_submission.submission
    and s.status = 'queued'
    and s.qstash_message_id is null
    and not exists (
      select 1 from private.form_pass_claims c where c.submission_id = s.id
    );
$$;

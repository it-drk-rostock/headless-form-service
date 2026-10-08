-- Failure list and retry (blueprint §4.5): the members of a form's team and
-- Super Admins see the form's delivery failures, metadata only, and retry
-- each one while QStash still keeps its message in the DLQ (7 days, §4.3).
-- The dashboard asks QStash for the retry with its own token; the functions
-- below check who may, hand it the message to retry, and record the outcome.
-- Each retry, and each one that found the message gone, is recorded in the
-- audit log, in the same transaction. The functions trust the dashboard to
-- report what QStash answered: a member calling them directly could mark a
-- delivery retried or gone without asking QStash, but only for their own
-- team's forms, and the audit log names them.

-- When the submission last failed, so the dashboard can tell whether the DLQ
-- may still hold its message. When the latest retry was started, and when a
-- retry found the message gone from the DLQ, so it is not offered again.
alter table public.form_stats
  add column failed_at timestamptz,
  add column retried_at timestamptz,
  add column dlq_gone_at timestamptz;

comment on column public.form_stats.failed_at is
  'When delivery last failed after all retries; the DLQ keeps the message for 7 days from then.';
comment on column public.form_stats.retried_at is
  'When a team member last retried the delivery from the DLQ.';
comment on column public.form_stats.dlq_gone_at is
  'When a retry found the message no longer in the DLQ; it cannot be retried any more.';

-- Failures recorded before this migration failed at their last change.
update public.form_stats set failed_at = updated_at where status = 'failed';

-- A form's failures, newest first, as the dashboard lists them.
create index form_stats_form_id_failed_idx
  on public.form_stats (form_id, submitted_at desc)
  where status <> 'sent';

-- Signed-in people read the delivery metadata of the forms they see (RLS),
-- never QStash's message ID, and write nothing. Ticket 32 reads the same rows
-- for the statistics. The anon role still has no access (ADR-0004).
grant select (id, form_id, version, status, submitted_at, updated_at,
  failure_reason, failed_at, retried_at, dlq_gone_at)
  on public.form_stats to authenticated;

create policy "Members see their teams' delivery status, Super Admins see all"
  on public.form_stats for select
  to authenticated
  using (
    exists (select 1 from public.forms f where f.id = form_stats.form_id)
  );

-- As before (20261008140000_delivery_failures.sql), and also records when
-- the submission failed.
create or replace function public.record_delivery_failure(
  submission uuid,
  form uuid,
  reason text
)
returns table (
  form_name text,
  team_name text,
  team_admins text[],
  submitted_at timestamptz,
  status public.submission_status
)
language plpgsql
-- `form_stats` has no grants for the secret key.
security definer
set search_path = ''
as $$
begin
  update public.form_stats s
  set status = 'failed',
      failure_reason = record_delivery_failure.reason,
      failed_at = now()
  where s.id = record_delivery_failure.submission
    and s.form_id = record_delivery_failure.form
    and s.status <> 'sent';

  return query
  select
    f.name,
    t.name,
    array(
      select p.email
      from public.team_members m
      join public.profiles p on p.id = m.user_id
      where m.team_id = f.team_id
        and m.role = 'team_admin'
        and p.email <> ''
      order by p.email
    ),
    s.submitted_at,
    s.status
  from public.forms f
  join public.teams t on t.id = f.team_id
  left join public.form_stats s
    on s.id = record_delivery_failure.submission
   and s.form_id = f.id
  where f.id = record_delivery_failure.form;
end;
$$;

-- The team of `submission`'s form, if the caller may retry its delivery:
-- a member of that team or a Super Admin. Refuses everyone else, and
-- submissions that do not exist, alike.
create function private.delivery_retry_team(submission uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  team uuid;
begin
  select f.team_id into team
  from public.form_stats s
  join public.forms f on f.id = s.form_id
  where s.id = delivery_retry_team.submission;
  if team is null
     or not ((select private.is_super_admin())
             or (select private.is_team_member(team))) then
    raise exception 'only the form''s team members and Super Admins may retry its deliveries'
      using errcode = 'insufficient_privilege';
  end if;
  return team;
end;
$$;

revoke all on function private.delivery_retry_team(uuid) from public;

-- QStash's ID of the failed submission's message, to find it in the DLQ.
-- Refused (HF011) unless the submission is failed and its message was not
-- found gone before.
create function public.delivery_retry_message(submission uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  message text;
begin
  perform private.delivery_retry_team(delivery_retry_message.submission);
  select s.qstash_message_id into message
  from public.form_stats s
  where s.id = delivery_retry_message.submission
    and s.status = 'failed'
    and s.dlq_gone_at is null;
  if message is null then
    raise exception 'submission % cannot be retried', delivery_retry_message.submission
      using errcode = 'HF011';
  end if;
  return message;
end;
$$;

-- Records that QStash took `submission`'s message out of the DLQ and queued
-- it again as `message`: the submission is queued again, and the dispatcher
-- marks it sent or failed as for any delivery. The retry is audited even if
-- the new message was delivered before this ran.
create function public.record_delivery_retry(submission uuid, message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid := private.delivery_retry_team(record_delivery_retry.submission);
  form_name text;
  form_version integer;
  submitted timestamptz;
begin
  update public.form_stats s
  set status = 'queued',
      qstash_message_id = record_delivery_retry.message,
      retried_at = now(),
      dlq_gone_at = null
  where s.id = record_delivery_retry.submission
    and s.status = 'failed';

  select f.name, s.version, s.submitted_at
  into form_name, form_version, submitted
  from public.form_stats s
  join public.forms f on f.id = s.form_id
  where s.id = record_delivery_retry.submission;

  perform private.record_audit(
    team, 'delivery.retried', 'submission', record_delivery_retry.submission,
    jsonb_build_object(
      'name', form_name,
      'version', form_version,
      'submitted_at', submitted
    )
  );
end;
$$;

-- Records that `message`, `submission`'s failed message, is no longer in the
-- DLQ, so the delivery cannot be retried any more, and audits it. Leaves the
-- submission alone if it has moved on meanwhile, such as by someone else's
-- retry.
create function public.record_delivery_retry_gone(submission uuid, message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team uuid := private.delivery_retry_team(record_delivery_retry_gone.submission);
  form_name text;
  form_version integer;
  submitted timestamptz;
begin
  update public.form_stats s
  set dlq_gone_at = now()
  from public.forms f
  where s.id = record_delivery_retry_gone.submission
    and f.id = s.form_id
    and s.status = 'failed'
    and s.qstash_message_id = record_delivery_retry_gone.message
    and s.dlq_gone_at is null
  returning f.name, s.version, s.submitted_at
  into form_name, form_version, submitted;

  if found then
    perform private.record_audit(
      team, 'delivery.retry_unavailable', 'submission',
      record_delivery_retry_gone.submission,
      jsonb_build_object(
        'name', form_name,
        'version', form_version,
        'submitted_at', submitted
      )
    );
  end if;
end;
$$;

-- Only signed-in people; the functions check who.
revoke all on function public.delivery_retry_message(uuid) from public, anon, service_role;
revoke all on function public.record_delivery_retry(uuid, text) from public, anon, service_role;
revoke all on function public.record_delivery_retry_gone(uuid, text) from public, anon, service_role;
grant execute on function public.delivery_retry_message(uuid) to authenticated;
grant execute on function public.record_delivery_retry(uuid, text) to authenticated;
grant execute on function public.record_delivery_retry_gone(uuid, text) to authenticated;

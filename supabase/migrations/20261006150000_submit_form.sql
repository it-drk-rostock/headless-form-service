-- Submitting a form (blueprint §4.2): `/submit-form` records each accepted
-- submission in `form_stats` and queues its answers, encrypted, in QStash
-- (ADR-0001). The answers themselves are never stored here. Like
-- `/load-form`, it works with the secret key through the functions below;
-- the anon role has no access at all (ADR-0004).

create type public.submission_status as enum ('queued', 'sent', 'failed');

-- One row per accepted submission, kept indefinitely for the statistics
-- (ticket 32). Written only by the functions below and, later, the
-- dispatcher (tickets 13, 30).
create table public.form_stats (
  -- The submission ID the embed generates once per form load.
  id uuid primary key,
  form_id uuid not null,
  version integer not null,
  status public.submission_status not null default 'queued',
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Technical, never personal data (blueprint §3).
  failure_reason text,
  qstash_message_id text,
  -- Rows go with their form only when it is deleted for good (ticket 24).
  constraint form_stats_form_version_fkey
    foreign key (form_id, version)
    references public.form_versions (form_id, version)
    on delete cascade
);

comment on table public.form_stats is
  'One row per accepted submission: IDs, version, delivery status. Never the answers.';

create index form_stats_form_id_version_idx
  on public.form_stats (form_id, version);

create trigger form_stats_set_updated_at
  before update on public.form_stats
  for each row execute function private.set_updated_at();

revoke all on public.form_stats from anon, authenticated, service_role;

alter table public.form_stats enable row level security;

-- The submitted version of a form that is published and not archived: its
-- questions, to drop answers to anything else, and the form's access type.
-- Older versions count too, so a visitor whose form was republished while
-- they filled it in can still send it. No row for anything else.
create function public.submission_form(form uuid, version integer)
returns table (schema jsonb, access_type public.form_access_type)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.schema, f.access_type
  from public.forms f
  join public.form_versions v
    on v.form_id = f.id and v.version = submission_form.version
  where f.id = submission_form.form
    and f.current_version is not null
    and f.archived_at is null;
$$;

-- Records `submission` as queued; true means "publish it now". False once
-- QStash's message ID is recorded, so a retry of the same submission is not
-- queued twice. A row still without one may never have reached QStash (its
-- publish failed and the row could not be removed), so it is published
-- again; QStash's deduplication on the submission ID drops a second message.
create function public.queue_submission(
  submission uuid,
  form uuid,
  version integer
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with queued as (
    insert into public.form_stats as s (id, form_id, version)
    values (queue_submission.submission, queue_submission.form, queue_submission.version)
    on conflict (id) do update set updated_at = now()
      where s.status = 'queued'
        and s.qstash_message_id is null
        and s.form_id = excluded.form_id
        and s.version = excluded.version
    returning 1
  )
  select exists (select 1 from queued);
$$;

-- Removes the row of a submission that could not be queued after all. Rows
-- that have moved on (sent, failed) stay.
create function public.unqueue_submission(submission uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.form_stats
  where id = unqueue_submission.submission
    and status = 'queued';
$$;

-- Keeps QStash's message ID, so a dead-lettered submission can be found and
-- replayed (ticket 31).
create function public.record_queued_message(submission uuid, message text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.form_stats
  set qstash_message_id = record_queued_message.message
  where id = record_queued_message.submission;
$$;

-- Only `/submit-form`, through the secret key.
revoke all on function public.submission_form(uuid, integer) from public, anon, authenticated;
revoke all on function public.queue_submission(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.unqueue_submission(uuid) from public, anon, authenticated;
revoke all on function public.record_queued_message(uuid, text) from public, anon, authenticated;
grant execute on function public.submission_form(uuid, integer) to service_role;
grant execute on function public.queue_submission(uuid, uuid, integer) to service_role;
grant execute on function public.unqueue_submission(uuid) to service_role;
grant execute on function public.record_queued_message(uuid, text) to service_role;

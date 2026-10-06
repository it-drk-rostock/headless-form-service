-- Delivering a submission (blueprint §4.4): `/dispatch-email` renders the
-- notification email of a queued submission and marks it sent. Like the
-- other edge functions, it works with the secret key through the functions
-- below (ADR-0004).

-- What the notification email of `submission` needs: the form's name and
-- recipients, which take effect at once, and the questions and email
-- template of the submitted version (ADR-0003). An archived or closed form
-- still gets the submissions it accepted before. `submitted_at` falls back to
-- now when the stats row is gone, and `status` is then null. No row for a
-- version that does not exist.
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
  status public.submission_status
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
    s.status
  from public.form_versions v
  join public.forms f on f.id = v.form_id
  left join public.form_stats s
    on s.id = dispatch_submission.submission
   and s.form_id = v.form_id
   and s.version = v.version
  where v.form_id = dispatch_submission.form
    and v.version = dispatch_submission.version;
$$;

-- Marks `submission` sent once its notification email is out. A failed one
-- that a retry delivered after all (ticket 31) counts as sent too.
create function public.mark_submission_sent(submission uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.form_stats
  set status = 'sent', failure_reason = null
  where id = mark_submission_sent.submission;
$$;

-- Only `/dispatch-email`, through the secret key.
revoke all on function public.dispatch_submission(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_submission_sent(uuid) from public, anon, authenticated;
grant execute on function public.dispatch_submission(uuid, uuid, integer) to service_role;
grant execute on function public.mark_submission_sent(uuid) to service_role;

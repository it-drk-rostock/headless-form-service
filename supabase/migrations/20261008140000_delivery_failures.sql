-- Delivery failures (blueprint §4.5): once QStash has used up its retries,
-- its failure callback reaches `/dispatch-email`, which marks the submission
-- failed and alerts the form's team's Team Admins. Like the rest of the
-- dispatcher, it works with the secret key through the function below
-- (ADR-0004).

-- Marks `submission` failed with a technical `reason` (never personal data,
-- blueprint §3), unless it was sent after all, and names whom to alert: the
-- form's and team's names and the Team Admins' addresses. A repeated failure,
-- such as a failed retry (ticket 31), keeps the newest reason. `status` is
-- the row's status afterwards; it and `submitted_at` are null when the stats
-- row is gone, so the alert still goes out. No row when the form is gone. An
-- archived form still gets its alerts.
create function public.record_delivery_failure(
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
-- `form_stats` has no grants, not even for the secret key.
security definer
set search_path = ''
as $$
begin
  update public.form_stats s
  set status = 'failed', failure_reason = record_delivery_failure.reason
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

-- Only `/dispatch-email`, through the secret key.
revoke all on function public.record_delivery_failure(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_delivery_failure(uuid, uuid, text) to service_role;

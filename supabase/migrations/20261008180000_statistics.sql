-- Statistics (blueprint §8): a form's submissions per hour or day, sent vs
-- failed, conversion (loads vs submissions) and submissions per version.
-- The members of a form's team and Super Admins see them; signed-in people
-- read `form_load_counts` through RLS like `form_stats`
-- (20261008160000_failure_retry.sql), and write nothing. The anon role still
-- has no access (ADR-0004).

grant select on public.form_load_counts to authenticated;

create policy "Members see their teams' form loads, Super Admins see all"
  on public.form_load_counts for select
  to authenticated
  using (
    exists (select 1 from public.forms f where f.id = form_load_counts.form_id)
  );

-- A form's submissions in a period, as the statistics count them.
create index form_stats_form_id_submitted_at_idx
  on public.form_stats (form_id, submitted_at);

-- A form's statistics for the last `days` Berlin days up to today: per hour
-- when `days` is 1 (today), else per day. Loads are counted per day only
-- (count_form_load), so hours carry no loads, and today's loads go into the
-- totals. Hours and days are Europe/Berlin's, as for the loads; on the days
-- clocks change, the doubled hour counts once and the skipped one stays 0.
-- Runs as its caller, so RLS decides: null for a form the person may not see.
--
--   { by: 'hour' | 'day', from, to: 'YYYY-MM-DD',
--     series: [{ at: 'YYYY-MM-DD' | 'YYYY-MM-DDTHH:00', submissions, sent,
--                failed, loads (null per hour) }], oldest first,
--     totals: { submissions, queued, sent, failed, loads },
--     versions: [{ version, submissions }], newest version first }
create function public.form_statistics(form uuid, days integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  last_day date := (now() at time zone 'Europe/Berlin')::date;
  first_day date;
  by_hour boolean := form_statistics.days = 1;
  result jsonb;
begin
  if form_statistics.days is null or form_statistics.days not between 1 and 366 then
    raise exception 'The statistics period must be 1 to 366 days, not %',
      form_statistics.days
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.forms f where f.id = form_statistics.form) then
    return null;
  end if;
  first_day := last_day - (form_statistics.days - 1);

  with submissions as (
    select
      s.version,
      s.status,
      case when by_hour
        then to_char(date_trunc('hour', s.submitted_at at time zone 'Europe/Berlin'),
                     'YYYY-MM-DD"T"HH24:00')
        else to_char((s.submitted_at at time zone 'Europe/Berlin')::date, 'YYYY-MM-DD')
      end as at
    from public.form_stats s
    where s.form_id = form_statistics.form
      and s.submitted_at >= first_day::timestamp at time zone 'Europe/Berlin'
  ),
  form_loads as (
    select to_char(c.day, 'YYYY-MM-DD') as at, c.count
    from public.form_load_counts c
    where c.form_id = form_statistics.form
      and c.day between first_day and last_day
  ),
  per_bucket as (
    select
      s.at,
      count(*) as submissions,
      count(*) filter (where s.status = 'sent') as sent,
      count(*) filter (where s.status = 'failed') as failed
    from submissions s
    group by s.at
  ),
  buckets as (
    select to_char(b, case when by_hour then 'YYYY-MM-DD"T"HH24:00' else 'YYYY-MM-DD' end) as at
    from generate_series(
      first_day::timestamp,
      case when by_hour then first_day + interval '23 hours' else last_day::timestamp end,
      case when by_hour then interval '1 hour' else interval '1 day' end
    ) as b
  )
  select jsonb_build_object(
    'by', case when by_hour then 'hour' else 'day' end,
    'from', to_char(first_day, 'YYYY-MM-DD'),
    'to', to_char(last_day, 'YYYY-MM-DD'),
    'series', (
      select jsonb_agg(jsonb_build_object(
        'at', b.at,
        'submissions', coalesce(p.submissions, 0),
        'sent', coalesce(p.sent, 0),
        'failed', coalesce(p.failed, 0),
        'loads', case when by_hour then null else coalesce(l.count, 0) end
      ) order by b.at)
      from buckets b
      left join per_bucket p on p.at = b.at
      left join form_loads l on l.at = b.at
    ),
    'totals', (
      select jsonb_build_object(
        'submissions', count(*),
        'queued', count(*) filter (where s.status = 'queued'),
        'sent', count(*) filter (where s.status = 'sent'),
        'failed', count(*) filter (where s.status = 'failed'),
        'loads', (select coalesce(sum(l.count), 0) from form_loads l)
      )
      from submissions s
    ),
    'versions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'version', v.version,
        'submissions', v.submissions
      ) order by v.version desc), '[]'::jsonb)
      from (
        select s.version, count(*) as submissions
        from submissions s
        group by s.version
      ) v
    )
  ) into result;
  return result;
end;
$$;

-- Signed-in people only; RLS limits them to their teams' forms.
revoke all on function public.form_statistics(uuid, integer) from public, anon, service_role;
grant execute on function public.form_statistics(uuid, integer) to authenticated;

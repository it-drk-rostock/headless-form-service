-- Keep-alive heartbeat: keeps the database active on the free plan by writing
-- a real transaction to a single-row table, preventing project pausing.
-- It can never grow past 1 row (id = 1 check). Direct table access is blocked;
-- only the service role via touch_keep_alive() may update it.

create table if not exists private.keep_alive (
  id integer primary key default 1 check (id = 1),
  last_seen_at timestamptz not null default now(),
  source text not null default 'cron',
  count bigint not null default 1 check (count >= 1)
);

alter table private.keep_alive enable row level security;
revoke all on private.keep_alive from public, anon, authenticated, service_role;

create or replace function public.touch_keep_alive(source_name text default 'cron')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  res record;
begin
  insert into private.keep_alive (id, last_seen_at, source, count)
  values (1, now(), coalesce(nullif(trim(source_name), ''), 'cron'), 1)
  on conflict (id) do update
    set last_seen_at = now(),
        source = coalesce(nullif(trim(excluded.source), ''), 'cron'),
        count = private.keep_alive.count + 1
  returning last_seen_at, source, count into res;

  return jsonb_build_object(
    'status', 'ok',
    'last_seen_at', res.last_seen_at,
    'source', res.source,
    'count', res.count
  );
end;
$$;

revoke all on function public.touch_keep_alive(text) from public, anon, authenticated;
grant execute on function public.touch_keep_alive(text) to service_role;

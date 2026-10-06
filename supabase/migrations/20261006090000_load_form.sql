-- Loading a form (blueprint §4.1): the embed asks `/load-form` for a form's
-- current version. The edge function reads with the secret key; the anon
-- role still has no table access at all (ADR-0004).

-- Global settings, one row (blueprint §3). For now only the allowed origins
-- that `/load-form` answers; rate limits, allowed recipient domains and the
-- Super Admin settings page come with their tickets (14, 20, 21). Until then
-- the row is changed in the SQL editor.
create table public.settings (
  -- Always true, so there can be only one row.
  id boolean primary key default true check (id),
  -- Exact origins as browsers send them, e.g. 'https://www.drk-rostock.de'.
  allowed_origins text[] not null default '{}'
    constraint settings_allowed_origins_check
    check (array_position(allowed_origins, null) is null),
  updated_at timestamptz not null default now()
);

comment on table public.settings is
  'Global settings, a single row. Read by the edge functions with the secret key.';

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function private.set_updated_at();

-- The dashboard runs locally on this origin (blueprint §9). TYPO3 pages are
-- added in the SQL editor until the settings page exists (ticket 20).
insert into public.settings (allowed_origins) values (array['http://localhost:3000']);

-- Edge functions read; nobody writes through the Data API yet.
revoke all on public.settings from anon, authenticated, service_role;
grant select on public.settings to service_role;

alter table public.settings enable row level security;

-- Form loads per form and day (Europe/Berlin), for the conversion statistics
-- (ticket 32). Written only by public.count_form_load().
create table public.form_load_counts (
  form_id uuid not null references public.forms (id) on delete cascade,
  day date not null,
  count integer not null default 0 check (count >= 0),
  primary key (form_id, day)
);

comment on table public.form_load_counts is
  'How often /load-form served each form per day (Europe/Berlin). Written only by public.count_form_load().';

revoke all on public.form_load_counts from anon, authenticated, service_role;

alter table public.form_load_counts enable row level security;

-- What a visitor may be served: the current version of a form that is
-- published and not archived. No row for anything else, so an unknown,
-- unpublished or archived form all look alike from outside.
create function public.load_form(form uuid)
returns table (version integer, schema jsonb, access_type public.form_access_type)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.version, v.schema, f.access_type
  from public.forms f
  join public.form_versions v
    on v.form_id = f.id and v.version = f.current_version
  where f.id = load_form.form
    and f.archived_at is null;
$$;

-- Counts one load of `form` for today, in Europe/Berlin. Security definer,
-- so even the secret key can only add one at a time, never set a count.
create function public.count_form_load(form uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.form_load_counts as c (form_id, day, count)
  values (count_form_load.form, (now() at time zone 'Europe/Berlin')::date, 1)
  on conflict (form_id, day) do update set count = c.count + 1;
$$;

-- Only `/load-form`, through the secret key.
revoke all on function public.load_form(uuid) from public, anon, authenticated;
revoke all on function public.count_form_load(uuid) from public, anon, authenticated;
grant execute on function public.load_form(uuid) to service_role;
grant execute on function public.count_form_load(uuid) to service_role;

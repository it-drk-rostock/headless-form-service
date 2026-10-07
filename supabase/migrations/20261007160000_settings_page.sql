-- Global settings page (blueprint §2.1, §3): Super Admins change the allowed
-- origins and both rate limits in the dashboard. `/load-form` and
-- `/submit-form` read the row on every request, so a change applies at once,
-- without a redeploy.

-- Until now the row was edited by hand in the SQL editor. Bring what the
-- dashboard would have stored into shape first: origins in lower case
-- without a trailing slash, each once, and limits within the new bounds.
-- Anything else (a path, a wildcard) still fails the check below, on
-- purpose: it never matched a browser's origin anyway, so fix it by hand.
update public.settings
set
  allowed_origins = array(
    select origin
    from (
      select rtrim(lower(btrim(entry)), '/') as origin, min(position) as first
      from unnest(allowed_origins) with ordinality as e (entry, position)
      where btrim(entry) <> ''
      group by 1
    ) cleaned
    order by first
  ),
  load_rate_limit = least(load_rate_limit, 100000),
  submit_rate_limit = least(submit_rate_limit, 100000);

-- Origins exactly as browsers send them: http or https, a lower-case host
-- (letters, digits, hyphens, dots) and an optional port, no path and no
-- trailing slash. Origins contain no spaces, so the list is checked joined
-- by spaces.
alter table public.settings
  drop constraint settings_allowed_origins_check,
  add constraint settings_allowed_origins_check
    check (
      array_position(allowed_origins, null) is null
      and array_position(allowed_origins, '') is null
      and cardinality(allowed_origins) <= 100
      and array_to_string(allowed_origins, ' ') ~
        '^(https?://[a-z0-9-]+(\.[a-z0-9-]+)*(:[0-9]{1,5})?( https?://[a-z0-9-]+(\.[a-z0-9-]+)*(:[0-9]{1,5})?)*)?$'
    );

-- Same bounds as the settings page (lib/settings/rate-limits.ts).
alter table public.settings
  drop constraint settings_load_rate_limit_check,
  add constraint settings_load_rate_limit_check
    check (load_rate_limit between 1 and 100000),
  drop constraint settings_submit_rate_limit_check,
  add constraint settings_submit_rate_limit_check
    check (submit_rate_limit between 1 and 100000);

-- Super Admins read and change the settings; nobody else sees them. The row
-- is never added or deleted through the Data API.
grant select on public.settings to authenticated;
grant update (allowed_origins, load_rate_limit, submit_rate_limit)
  on public.settings to authenticated;

create policy "Super Admins see the settings"
  on public.settings for select
  to authenticated
  using ((select private.is_super_admin()));

create policy "Super Admins change the settings"
  on public.settings for update
  to authenticated
  using ((select private.is_super_admin()))
  with check ((select private.is_super_admin()));

-- Every change is audited (blueprint §3). The settings belong to no team, so
-- only Super Admins see the entries.
create function private.audit_settings_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.allowed_origins is distinct from new.allowed_origins then
    perform private.record_audit(
      null, 'settings.origins_changed', 'settings', null,
      jsonb_build_object(
        'from', to_jsonb(old.allowed_origins),
        'to', to_jsonb(new.allowed_origins)
      )
    );
  end if;
  if old.load_rate_limit is distinct from new.load_rate_limit then
    perform private.record_audit(
      null, 'settings.load_limit_changed', 'settings', null,
      jsonb_build_object('from', old.load_rate_limit, 'to', new.load_rate_limit)
    );
  end if;
  if old.submit_rate_limit is distinct from new.submit_rate_limit then
    perform private.record_audit(
      null, 'settings.submit_limit_changed', 'settings', null,
      jsonb_build_object(
        'from', old.submit_rate_limit,
        'to', new.submit_rate_limit
      )
    );
  end if;
  return null;
end;
$$;

revoke all on function private.audit_settings_change() from public;

create trigger settings_audit_change
  after update of allowed_origins, load_rate_limit, submit_rate_limit
  on public.settings
  for each row
  when (old.allowed_origins is distinct from new.allowed_origins
        or old.load_rate_limit is distinct from new.load_rate_limit
        or old.submit_rate_limit is distinct from new.submit_rate_limit)
  execute function private.audit_settings_change();

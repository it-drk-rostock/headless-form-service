-- Validate the version-matched SurveyJS ITheme/IHeader JSON shape at the
-- storage boundary, including direct Data API writes.
create function private.valid_survey_theme(theme jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  key text;
  value jsonb;
  header_key text;
  header_value jsonb;
begin
  if theme is null then return true; end if;
  if jsonb_typeof(theme) <> 'object' then return false; end if;
  for key, value in select * from jsonb_each(theme) loop
    if key = 'cssVariables' then
      if jsonb_typeof(value) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_each(value) v where v.key not like '--%' or jsonb_typeof(v.value) <> 'string') then return false; end if;
    elsif key = 'header' then
      if jsonb_typeof(value) <> 'object' then return false; end if;
      for header_key, header_value in select * from jsonb_each(value) loop
        if header_key in ('height', 'mobileHeight', 'textAreaWidth', 'backgroundImageOpacity') then
          if jsonb_typeof(header_value) <> 'number' then return false; end if;
          if header_value::numeric < 0 or (header_key = 'backgroundImageOpacity' and header_value::numeric > 1) then return false; end if;
        elsif header_key = 'overlapEnabled' then
          if jsonb_typeof(header_value) <> 'boolean' then return false; end if;
        elsif header_key = 'backgroundImage' then
          if jsonb_typeof(header_value) <> 'string' then return false; end if;
        elsif header_key = 'inheritWidthFrom' then
          if header_value not in ('"survey"', '"container"') then return false; end if;
        elsif header_key = 'backgroundImageFit' then
          if header_value not in ('"cover"', '"fill"', '"contain"', '"tile"') then return false; end if;
        elsif header_key in ('logoPositionX', 'titlePositionX', 'descriptionPositionX') then
          if header_value not in ('"left"', '"center"', '"right"') then return false; end if;
        elsif header_key in ('logoPositionY', 'titlePositionY', 'descriptionPositionY') then
          if header_value not in ('"top"', '"middle"', '"bottom"') then return false; end if;
        else return false;
        end if;
      end loop;
    elsif key in ('themeName', 'backgroundImage') then
      if jsonb_typeof(value) <> 'string' then return false; end if;
    elsif key = 'colorPalette' then
      if value not in ('"light"', '"dark"') then return false; end if;
    elsif key = 'isPanelless' then
      if jsonb_typeof(value) <> 'boolean' then return false; end if;
    elsif key = 'backgroundOpacity' then
      if jsonb_typeof(value) <> 'number' then return false; end if;
      if value::numeric < 0 or value::numeric > 1 then return false; end if;
    elsif key = 'backgroundImageFit' then
      if value not in ('"auto"', '"contain"', '"cover"') then return false; end if;
    elsif key = 'backgroundImageAttachment' then
      if value not in ('"fixed"', '"scroll"') then return false; end if;
    elsif key = 'headerView' then
      if value not in ('"basic"', '"advanced"') then return false; end if;
    else return false;
    end if;
  end loop;
  return true;
end;
$$;
revoke all on function private.valid_survey_theme(jsonb) from public, anon;
grant execute on function private.valid_survey_theme(jsonb) to authenticated, service_role;

alter table public.settings add column global_theme jsonb
  constraint settings_global_theme_check check (private.valid_survey_theme(global_theme));
grant update (global_theme) on public.settings to authenticated;

-- Only this private function bypasses settings RLS. The exposed wrapper uses
-- invoker rights; no unrelated settings are returned and no writes are exposed.
create function private.get_global_theme()
returns jsonb language sql stable security definer set search_path = '' as $$
  select global_theme from public.settings where id = true and auth.uid() is not null;
$$;
revoke all on function private.get_global_theme() from public, anon, service_role;
grant execute on function private.get_global_theme() to authenticated;

create function public.get_global_theme()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.get_global_theme();
$$;
revoke all on function public.get_global_theme() from public, anon, service_role;
grant execute on function public.get_global_theme() to authenticated;

create or replace function public.load_form(form uuid)
returns table (version integer, schema jsonb, access_type public.form_access_type,
  turnstile_enabled boolean, is_closed boolean, theme jsonb)
language sql stable security invoker set search_path = '' as $$
  select v.version, v.schema, f.access_type, f.turnstile_enabled, f.is_closed,
    coalesce(v.theme, (select s.global_theme from public.settings s where s.id = true))
  from public.forms f
  join public.form_versions v on v.form_id = f.id and v.version = f.current_version
  where f.id = load_form.form and f.archived_at is null;
$$;

create function private.audit_global_theme_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.record_audit(null, 'settings.theme_changed', 'settings', null,
    jsonb_build_object('from', old.global_theme, 'to', new.global_theme));
  return null;
end;
$$;
revoke all on function private.audit_global_theme_change() from public, anon, authenticated, service_role;
create trigger settings_audit_theme_change
  after update of global_theme on public.settings for each row
  when (old.global_theme is distinct from new.global_theme)
  execute function private.audit_global_theme_change();

-- The settings page and public form endpoints require this singleton row.
-- Restore the original provisioned values if it was removed, while preserving
-- every configured value (including updated_at) when the row already exists.
insert into public.settings (
  id, allowed_origins, allowed_recipient_domains, load_rate_limit, submit_rate_limit
)
values (
  true, array['http://localhost:3000'], array['drk-rostock.de'], 60, 3
)
on conflict (id) do nothing;

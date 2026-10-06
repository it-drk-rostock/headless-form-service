-- Rate limits of the public edge functions (blueprint §3, §4.1, §4.2): how
-- many requests one IP may make per minute, as a sliding window in Upstash
-- Redis. Read with the allowed origins on every request, so a change applies
-- at once. Until the settings page exists (ticket 20), they are changed in
-- the SQL editor.
alter table public.settings
  add column load_rate_limit integer not null default 60
    constraint settings_load_rate_limit_check check (load_rate_limit > 0),
  add column submit_rate_limit integer not null default 10
    constraint settings_submit_rate_limit_check check (submit_rate_limit > 0);

comment on column public.settings.load_rate_limit is
  'Requests per minute and IP that /load-form serves before answering 429.';
comment on column public.settings.submit_rate_limit is
  'Requests per minute and IP that /submit-form takes before answering 429.';

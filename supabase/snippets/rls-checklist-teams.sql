-- Manual RLS checklist for teams, memberships, the audit log, forms, the draft, publishing, loading forms, the global settings, allowed recipient domains, restoring and discarding, closing, archiving and deleting forms, form passes, and delivery failures and their retry (tickets 04-10, 20-25, 31). Run it in the Supabase SQL editor
-- after `npm run db:push`. It creates a test team setup inside a transaction,
-- checks each rule as the person it concerns, and rolls everything back.
--
-- Passed: the result is "RLS checklist passed: 46 of 46 checks". Failed: it stops with
-- "RLS check <n> failed: ..." and nothing is kept.
--
-- Test setup (all rolled back):
--   Super Admin  …c001  member of no team
--   Team Admin   …c002  team_admin of team A
--   Member A     …c003  member of team A
--   Member B     …c004  member of team B
--   Form A       …f1    of team A;  Form B  …f2  of team B
--   Submission   …d1    of form A, failed (added after Member A's checks)
-- `npm test` runs this file against the migrations (supabase/tests/).

begin;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000c001', 'rls-check-super-admin@example.invalid'),
  ('00000000-0000-4000-8000-00000000c002', 'rls-check-team-admin@example.invalid'),
  ('00000000-0000-4000-8000-00000000c003', 'rls-check-member-a@example.invalid'),
  ('00000000-0000-4000-8000-00000000c004', 'rls-check-member-b@example.invalid');

update public.profiles set is_super_admin = true
where id = '00000000-0000-4000-8000-00000000c001';

insert into public.teams (id, name) values
  ('00000000-0000-4000-8000-0000000000a1', 'RLS-Check Team A'),
  ('00000000-0000-4000-8000-0000000000b1', 'RLS-Check Team B');

insert into public.team_members (team_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c002', 'team_admin'),
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000c003', 'member'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c004', 'member');

insert into public.forms (id, team_id, name) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', 'RLS-Check Formular A'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000b1', 'RLS-Check Formular B');

-- The test recipients' domain, so recipients can be saved (checks 22, 23).
update public.settings
set allowed_recipient_domains = array_append(allowed_recipient_domains, 'example.invalid');

-- As Member A ---------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c003"}', true);

do $$
declare
  changed int;
begin
  -- 1. A member sees only their own teams.
  if (select array_agg(id) from public.teams)
     is distinct from array['00000000-0000-4000-8000-0000000000a1'::uuid] then
    raise exception 'RLS check 1 failed: Member A sees teams other than team A';
  end if;

  -- 2. A member sees the memberships of their own team, and no others.
  if (select count(*) from public.team_members) <> 2
     or exists (select 1 from public.team_members
                where team_id <> '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'RLS check 2 failed: Member A sees memberships outside team A';
  end if;

  -- 3. A member cannot add themselves to another team.
  begin
    insert into public.team_members (team_id, user_id) values
      ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c003');
    raise exception 'RLS check 3 failed: Member A joined team B';
  exception when insufficient_privilege then null;
  end;

  -- 10. A member cannot promote themselves or remove anyone.
  update public.team_members set role = 'team_admin'
  where user_id = '00000000-0000-4000-8000-00000000c003';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 10 failed: Member A promoted themselves';
  end if;
  delete from public.team_members
  where team_id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 10 failed: Member A removed members';
  end if;

  -- 11. A member sees the profiles of their teammates, and no others.
  if (select array_agg(id order by id) from public.profiles)
     is distinct from array['00000000-0000-4000-8000-00000000c002'::uuid,
                            '00000000-0000-4000-8000-00000000c003'::uuid] then
    raise exception 'RLS check 11 failed: Member A sees profiles outside team A';
  end if;

  -- 16. A member sees no audit log entries, not even of their own team.
  if exists (select 1 from public.audit_log) then
    raise exception 'RLS check 16 failed: Member A sees audit log entries';
  end if;

  -- 20. A member sees their own team's forms, and no others.
  if (select array_agg(id) from public.forms)
     is distinct from array['00000000-0000-4000-8000-0000000000f1'::uuid] then
    raise exception 'RLS check 20 failed: Member A sees forms other than team A''s';
  end if;

  -- 21. A member creates forms for their own team, and for no other.
  insert into public.forms (team_id, name) values
    ('00000000-0000-4000-8000-0000000000a1', 'RLS-Check Formular A2');
  begin
    insert into public.forms (team_id, name) values
      ('00000000-0000-4000-8000-0000000000b1', 'RLS-Check fremdes Formular');
    raise exception 'RLS check 21 failed: Member A created a form for team B';
  exception when insufficient_privilege then null;
  end;

  -- 22. A member changes the recipients of their own team's forms, and of no
  -- other team's.
  update public.forms set recipients = '{rls-check@example.invalid}'
  where id = '00000000-0000-4000-8000-0000000000f1';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 22 failed: Member A could not change team A''s recipients';
  end if;
  update public.forms set recipients = '{rls-check@example.invalid}'
  where id = '00000000-0000-4000-8000-0000000000f2';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 22 failed: Member A changed team B''s recipients';
  end if;

  -- 35. A recipient outside the allowed recipient domains is refused.
  begin
    update public.forms set recipients = '{rls-check@private-mailbox.invalid}'
    where id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'RLS check 35 failed: Member A saved a recipient outside the allowed domains';
  exception when sqlstate 'HF006' then null;
  end;

  -- 26. A member saves the draft (questions and email template) of their own
  -- team's forms, stamped with who and when, and of no other team's.
  update public.forms
  set draft_schema = '{"pages":[]}',
      draft_email_template = '{"mode":"standard","subject":"RLS-Check","body":""}'
  where id = '00000000-0000-4000-8000-0000000000f1';
  if (select draft_updated_by from public.forms
      where id = '00000000-0000-4000-8000-0000000000f1')
     is distinct from '00000000-0000-4000-8000-00000000c003' then
    raise exception 'RLS check 26 failed: the draft save of Member A is not stamped with Member A';
  end if;
  update public.forms set draft_schema = '{"pages":[]}'
  where id = '00000000-0000-4000-8000-0000000000f2';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 26 failed: Member A saved team B''s draft';
  end if;
  update public.forms
  set draft_email_template = '{"mode":"standard","subject":"RLS-Check","body":""}'
  where id = '00000000-0000-4000-8000-0000000000f2';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 26 failed: Member A saved team B''s email template';
  end if;

  -- 27. The draft refuses file and signature questions, from any path.
  begin
    update public.forms
    set draft_schema = '{"pages":[{"name":"p","elements":[{"type":"file","name":"f"}]}]}'
    where id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'RLS check 27 failed: Member A saved a file question into the draft';
  exception when check_violation then null;
  end;

  -- 28. A member publishes their own team's form: the draft becomes version 1
  -- and the current version. Another team's form they cannot publish.
  update public.forms
  set draft_schema = '{"pages":[{"name":"p","elements":[{"type":"text","name":"q"}]}]}'
  where id = '00000000-0000-4000-8000-0000000000f1';
  if public.publish_form('00000000-0000-4000-8000-0000000000f1', 'RLS-Check') <> 1 then
    raise exception 'RLS check 28 failed: Member A''s publish of form A is not version 1';
  end if;
  if (select current_version from public.forms
      where id = '00000000-0000-4000-8000-0000000000f1') is distinct from 1
     or (select schema from public.form_versions
         where form_id = '00000000-0000-4000-8000-0000000000f1' and version = 1)
        is distinct from '{"pages":[{"name":"p","elements":[{"type":"text","name":"q"}]}]}'::jsonb then
    raise exception 'RLS check 28 failed: Member A''s publish did not make the draft the current version';
  end if;
  begin
    perform public.publish_form('00000000-0000-4000-8000-0000000000f2');
    raise exception 'RLS check 28 failed: Member A published team B''s form';
  exception when insufficient_privilege then null;
  end;

  -- 29. Form versions cannot be written directly, only by publishing.
  begin
    update public.form_versions set changelog = 'RLS-Check geändert'
    where form_id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'RLS check 29 failed: Member A changed a form version';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.form_versions (form_id, version, schema, email_template)
    values ('00000000-0000-4000-8000-0000000000f1', 2, '{}', '{}');
    raise exception 'RLS check 29 failed: Member A inserted a form version';
  exception when insufficient_privilege then null;
  end;

  -- 36. A member discards the draft changes of their own team's form and
  -- restores one of its versions; another team's form they cannot.
  update public.forms
  set draft_schema = '{"elements":[{"type":"comment","name":"neu"}]}'
  where id = '00000000-0000-4000-8000-0000000000f1';
  perform public.discard_draft_changes('00000000-0000-4000-8000-0000000000f1');
  if (select draft_schema from public.forms
      where id = '00000000-0000-4000-8000-0000000000f1')
     is distinct from '{"pages":[{"name":"p","elements":[{"type":"text","name":"q"}]}]}'::jsonb then
    raise exception 'RLS check 36 failed: Member A''s discard did not reset the draft to version 1';
  end if;
  perform public.restore_form_version('00000000-0000-4000-8000-0000000000f1', 1);
  begin
    perform public.restore_form_version('00000000-0000-4000-8000-0000000000f2', 1);
    raise exception 'RLS check 36 failed: Member A restored a version of team B''s form';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.discard_draft_changes('00000000-0000-4000-8000-0000000000f2');
    raise exception 'RLS check 36 failed: Member A discarded team B''s draft changes';
  exception when insufficient_privilege then null;
  end;

  -- 38. A member closes and reopens their own team's form; another team's
  -- form they cannot close.
  update public.forms set is_closed = true
  where id = '00000000-0000-4000-8000-0000000000f1';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 38 failed: Member A could not close team A''s form';
  end if;
  update public.forms set is_closed = false
  where id = '00000000-0000-4000-8000-0000000000f1';
  update public.forms set is_closed = true
  where id = '00000000-0000-4000-8000-0000000000f2';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 38 failed: Member A closed team B''s form';
  end if;

  -- 40. A member archives and unarchives their own team's form; another
  -- team's form they cannot archive.
  perform public.archive_form('00000000-0000-4000-8000-0000000000f1');
  if not exists (select 1 from public.forms
                 where id = '00000000-0000-4000-8000-0000000000f1'
                   and archived_at is not null) then
    raise exception 'RLS check 40 failed: Member A could not archive team A''s form';
  end if;
  perform public.unarchive_form('00000000-0000-4000-8000-0000000000f1');
  begin
    perform public.archive_form('00000000-0000-4000-8000-0000000000f2');
    raise exception 'RLS check 40 failed: Member A archived team B''s form';
  exception when insufficient_privilege then null;
  end;

  -- 43. A member makes their own team's form protected, creates a form
  -- pass for it and revokes it, but never reads its hash. Another team's
  -- form gets no pass from them.
  update public.forms
  set access_type = 'protected', page_url = 'https://rls-check.example.invalid/formular'
  where id = '00000000-0000-4000-8000-0000000000f1';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 43 failed: Member A could not protect team A''s form';
  end if;
  -- Kept for Member B, who must not revoke it.
  perform set_config('rls_check.form_pass',
    public.create_form_pass('00000000-0000-4000-8000-0000000000f1',
      repeat('c', 64), 1, null, '{"ticket": "RLS-1"}')::text, true);
  perform public.revoke_form_pass(current_setting('rls_check.form_pass')::uuid);
  if not exists (select 1 from public.form_passes
                 where form_id = '00000000-0000-4000-8000-0000000000f1'
                   and revoked_at is not null) then
    raise exception 'RLS check 43 failed: Member A could not create and revoke a form pass';
  end if;
  begin
    perform token_hash from public.form_passes;
    raise exception 'RLS check 43 failed: Member A can read form pass hashes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_form_pass('00000000-0000-4000-8000-0000000000f2',
      repeat('d', 64), 1, null, '{}');
    raise exception 'RLS check 43 failed: Member A created a form pass for team B''s form';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.form_passes set use_count = 0;
    raise exception 'RLS check 43 failed: Member A wrote a form pass directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A failed delivery of form A's version 1 (check 28), for checks 45 and 46.
reset role;
insert into public.form_stats
  (id, form_id, version, status, failure_reason, failed_at, qstash_message_id)
values ('00000000-0000-4000-8000-0000000000d1',
        '00000000-0000-4000-8000-0000000000f1', 1, 'failed', 'HTTP 500', now(),
        'rls-check-message');

-- As Member B ---------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c004"}', true);

do $$
begin
  -- 4. A team someone does not belong to is invisible, by ID too.
  if exists (select 1 from public.teams
             where id = '00000000-0000-4000-8000-0000000000a1')
     or exists (select 1 from public.team_members
                where team_id = '00000000-0000-4000-8000-0000000000a1')
     or exists (select 1 from public.forms
                where id = '00000000-0000-4000-8000-0000000000f1') then
    raise exception 'RLS check 4 failed: Member B sees team A';
  end if;

  -- 30. A member sees no form versions of other teams.
  if exists (select 1 from public.form_versions
             where form_id = '00000000-0000-4000-8000-0000000000f1') then
    raise exception 'RLS check 30 failed: Member B sees team A''s form versions';
  end if;

  -- 43. A member sees no form passes of other teams, and cannot revoke them.
  if exists (select 1 from public.form_passes
             where form_id = '00000000-0000-4000-8000-0000000000f1') then
    raise exception 'RLS check 43 failed: Member B sees team A''s form passes';
  end if;
  begin
    perform public.revoke_form_pass(current_setting('rls_check.form_pass')::uuid);
    raise exception 'RLS check 43 failed: Member B revoked a form pass of team A';
  exception when insufficient_privilege then null;
  end;

  -- 45. A member sees no delivery failures of other teams, and cannot retry
  -- them.
  if exists (select 1 from public.form_stats
             where form_id = '00000000-0000-4000-8000-0000000000f1') then
    raise exception 'RLS check 45 failed: Member B sees team A''s delivery failures';
  end if;
  begin
    perform public.delivery_retry_message('00000000-0000-4000-8000-0000000000d1');
    raise exception 'RLS check 45 failed: Member B got the message of team A''s failed delivery';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.record_delivery_retry('00000000-0000-4000-8000-0000000000d1', 'rls-check-forged');
    raise exception 'RLS check 45 failed: Member B recorded a retry of team A''s delivery';
  exception when insufficient_privilege then null;
  end;
end $$;

-- As the Team Admin of team A -------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c002"}', true);

do $$
declare
  changed int;
begin
  -- 5. A Team Admin cannot rename their team.
  update public.teams set name = 'Umbenannt'
  where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 5 failed: the Team Admin renamed team A';
  end if;

  -- 6. A Team Admin cannot create a team.
  begin
    insert into public.teams (name) values ('RLS-Check eigenes Team');
    raise exception 'RLS check 6 failed: the Team Admin created a team';
  exception when insufficient_privilege then null;
  end;

  -- 12. A Team Admin manages roles in their own team.
  update public.team_members set role = 'team_admin'
  where team_id = '00000000-0000-4000-8000-0000000000a1'
    and user_id = '00000000-0000-4000-8000-00000000c003';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 12 failed: the Team Admin could not promote Member A';
  end if;
  update public.team_members set role = 'member'
  where team_id = '00000000-0000-4000-8000-0000000000a1'
    and user_id = '00000000-0000-4000-8000-00000000c003';

  -- 13. A Team Admin cannot add to, change or remove from another team.
  begin
    insert into public.team_members (team_id, user_id) values
      ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000c003');
    raise exception 'RLS check 13 failed: the Team Admin added someone to team B';
  exception when insufficient_privilege then null;
  end;
  delete from public.team_members
  where team_id = '00000000-0000-4000-8000-0000000000b1';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 13 failed: the Team Admin removed members of team B';
  end if;

  -- 14. The last Team Admin cannot step down or leave.
  begin
    update public.team_members set role = 'member'
    where user_id = '00000000-0000-4000-8000-00000000c002';
    raise exception 'RLS check 14 failed: the last Team Admin of team A stepped down';
  exception when sqlstate 'HF001' then null;
  end;
  begin
    delete from public.team_members
    where user_id = '00000000-0000-4000-8000-00000000c002';
    raise exception 'RLS check 14 failed: the last Team Admin of team A left';
  exception when sqlstate 'HF001' then null;
  end;

  -- 17. A Team Admin sees their own team's log, including their role changes
  -- from check 12, and nothing of other teams.
  if (select count(*) from public.audit_log
      where action = 'member.role_changed'
        and actor_id = '00000000-0000-4000-8000-00000000c002'
        and entity_id = '00000000-0000-4000-8000-00000000c003') <> 2 then
    raise exception 'RLS check 17 failed: the role changes of check 12 are not in the audit log';
  end if;
  if exists (select 1 from public.audit_log
             where team_id is distinct from '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'RLS check 17 failed: the Team Admin sees audit log entries of other teams';
  end if;

  -- 18. Nobody signed in can add, edit or delete audit log entries.
  begin
    insert into public.audit_log (team_id, action, entity_type) values
      ('00000000-0000-4000-8000-0000000000a1', 'rls.check', 'check');
    raise exception 'RLS check 18 failed: the Team Admin added an audit log entry';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.audit_log set action = 'rls.check';
    raise exception 'RLS check 18 failed: the Team Admin edited the audit log';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.audit_log;
    raise exception 'RLS check 18 failed: the Team Admin deleted audit log entries';
  exception when insufficient_privilege then null;
  end;

  -- 23. A Team Admin sees the recipient change of check 22 in the log.
  if not exists (select 1 from public.audit_log
                 where action = 'form.recipients_changed'
                   and actor_id = '00000000-0000-4000-8000-00000000c003'
                   and entity_id = '00000000-0000-4000-8000-0000000000f1') then
    raise exception 'RLS check 23 failed: the recipient change of check 22 is not in the audit log';
  end if;

  -- 31. A Team Admin sees the publish of check 28 in the log.
  if not exists (select 1 from public.audit_log
                 where action = 'form.published'
                   and actor_id = '00000000-0000-4000-8000-00000000c003'
                   and entity_id = '00000000-0000-4000-8000-0000000000f1') then
    raise exception 'RLS check 31 failed: the publish of check 28 is not in the audit log';
  end if;

  -- 37. A Team Admin sees the discard and the restore of check 36 in the log.
  if (select count(distinct action) from public.audit_log
      where action in ('form.draft_discarded', 'form.version_restored')
        and actor_id = '00000000-0000-4000-8000-00000000c003'
        and entity_id = '00000000-0000-4000-8000-0000000000f1') <> 2 then
    raise exception 'RLS check 37 failed: the discard and restore of check 36 are not in the audit log';
  end if;

  -- 39. A Team Admin sees the closing and reopening of check 38 in the log.
  if (select count(distinct action) from public.audit_log
      where action in ('form.closed', 'form.reopened')
        and actor_id = '00000000-0000-4000-8000-00000000c003'
        and entity_id = '00000000-0000-4000-8000-0000000000f1') <> 2 then
    raise exception 'RLS check 39 failed: the closing and reopening of check 38 are not in the audit log';
  end if;

  -- 41. A Team Admin sees the archiving and unarchiving of check 40 in the log.
  if (select count(distinct action) from public.audit_log
      where action in ('form.archived', 'form.unarchived')
        and actor_id = '00000000-0000-4000-8000-00000000c003'
        and entity_id = '00000000-0000-4000-8000-0000000000f1') <> 2 then
    raise exception 'RLS check 41 failed: the archiving and unarchiving of check 40 are not in the audit log';
  end if;

  -- 44. A Team Admin sees the form pass creation and revocation of check 43
  -- in the log.
  if (select count(distinct action) from public.audit_log
      where action in ('form_pass.created', 'form_pass.revoked')
        and actor_id = '00000000-0000-4000-8000-00000000c003') <> 2 then
    raise exception 'RLS check 44 failed: the form pass creation and revocation of check 43 are not in the audit log';
  end if;

  -- 45. A member of the form's team sees its delivery failures, but not
  -- QStash's message ID, and retries one: it is queued again.
  if not exists (select 1 from public.form_stats
                 where id = '00000000-0000-4000-8000-0000000000d1'
                   and status = 'failed' and failure_reason = 'HTTP 500') then
    raise exception 'RLS check 45 failed: the Team Admin does not see team A''s delivery failure';
  end if;
  begin
    perform qstash_message_id from public.form_stats;
    raise exception 'RLS check 45 failed: the Team Admin can read QStash message IDs';
  exception when insufficient_privilege then null;
  end;
  if public.delivery_retry_message('00000000-0000-4000-8000-0000000000d1')
     is distinct from 'rls-check-message' then
    raise exception 'RLS check 45 failed: the Team Admin cannot retry team A''s delivery';
  end if;
  perform public.record_delivery_retry('00000000-0000-4000-8000-0000000000d1', 'rls-check-retried');
  if (select status from public.form_stats
      where id = '00000000-0000-4000-8000-0000000000d1') <> 'queued' then
    raise exception 'RLS check 45 failed: the retried delivery is not queued again';
  end if;

  -- 46. The retry of check 45 is in the audit log.
  if not exists (select 1 from public.audit_log
                 where action = 'delivery.retried'
                   and entity_id = '00000000-0000-4000-8000-0000000000d1'
                   and actor_id = '00000000-0000-4000-8000-00000000c002') then
    raise exception 'RLS check 46 failed: the retry of check 45 is not in the audit log';
  end if;

  -- 42. Only Super Admins delete forms for good, not even a Team Admin.
  begin
    perform public.delete_form('00000000-0000-4000-8000-0000000000f1');
    raise exception 'RLS check 42 failed: the Team Admin deleted a form';
  exception when insufficient_privilege then null;
  end;

  -- 24. Nobody signed in moves a form to another team, deletes it through
  -- the Data API, sets what only publishing and archiving may set, or who
  -- saved the draft.
  begin
    update public.forms set current_version = 1
    where id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'RLS check 24 failed: the Team Admin wrote a column without a write path';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.forms set archived_at = now()
    where id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'RLS check 24 failed: the Team Admin set when a form was archived';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.forms set draft_updated_by = '00000000-0000-4000-8000-00000000c003'
    where id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'RLS check 24 failed: the Team Admin set who saved the draft';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.forms set team_id = '00000000-0000-4000-8000-0000000000b1'
    where id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'RLS check 24 failed: the Team Admin moved a form to team B';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.forms where id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'RLS check 24 failed: the Team Admin deleted a form';
  exception when insufficient_privilege then null;
  end;

  -- 33. Only Super Admins see and change the global settings.
  if exists (select 1 from public.settings) then
    raise exception 'RLS check 33 failed: the Team Admin sees the settings';
  end if;
  update public.settings set allowed_origins = '{https://rls-check.example.invalid}';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 33 failed: the Team Admin changed the allowed origins';
  end if;
  update public.settings set allowed_recipient_domains = '{private-mailbox.invalid}';
  get diagnostics changed = row_count;
  if changed <> 0 then
    raise exception 'RLS check 33 failed: the Team Admin changed the allowed recipient domains';
  end if;
end $$;

-- As the Super Admin (member of no team) --------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","sub":"00000000-0000-4000-8000-00000000c001"}', true);

do $$
declare
  changed int;
  doomed uuid;
begin
  -- 7. A Super Admin sees every team and every membership.
  if (select count(*) from public.teams where id in (
        '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')) <> 2
     or (select count(*) from public.team_members where team_id in (
        '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')) <> 3 then
    raise exception 'RLS check 7 failed: the Super Admin does not see all teams';
  end if;

  -- 8. A Super Admin can rename and create teams.
  update public.teams set name = 'RLS-Check Team A2'
  where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 8 failed: the Super Admin could not rename team A';
  end if;
  insert into public.teams (name) values ('RLS-Check Team C');

  -- 15. A Super Admin may remove a team's last Team Admin.
  delete from public.team_members
  where team_id = '00000000-0000-4000-8000-0000000000a1'
    and user_id = '00000000-0000-4000-8000-00000000c002';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 15 failed: the Super Admin could not remove the last Team Admin';
  end if;

  -- 19. A Super Admin sees the audit log of every team.
  if (select count(distinct team_id) from public.audit_log where team_id in (
        '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1')) <> 2 then
    raise exception 'RLS check 19 failed: the Super Admin does not see every team''s audit log';
  end if;

  -- 25. A Super Admin sees every team's forms.
  if (select count(*) from public.forms where id in (
        '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2')) <> 2 then
    raise exception 'RLS check 25 failed: the Super Admin does not see every team''s forms';
  end if;

  -- 34. A Super Admin changes the global settings, and the change is in
  -- the audit log.
  update public.settings set load_rate_limit = load_rate_limit + 1;
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'RLS check 34 failed: the Super Admin could not change the settings';
  end if;
  if not exists (select 1 from public.audit_log
                 where action = 'settings.load_limit_changed'
                   and actor_id = '00000000-0000-4000-8000-00000000c001') then
    raise exception 'RLS check 34 failed: the settings change is not in the audit log';
  end if;

  -- 42. A Super Admin deletes a form for good, and it is in the audit log.
  insert into public.forms (team_id, name)
  values ('00000000-0000-4000-8000-0000000000b1', 'RLS-Check Formular C')
  returning id into doomed;
  perform public.delete_form(doomed);
  if exists (select 1 from public.forms where id = doomed) then
    raise exception 'RLS check 42 failed: the Super Admin could not delete a form';
  end if;
  if not exists (select 1 from public.audit_log
                 where action = 'form.deleted' and entity_id = doomed
                   and actor_id = '00000000-0000-4000-8000-00000000c001') then
    raise exception 'RLS check 42 failed: the deletion is not in the audit log';
  end if;
end $$;

-- As a visitor (anon) ---------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

do $$
declare
  exposed text;
begin
  -- 9. The anon role cannot read teams, memberships, the audit log, forms or
  -- form versions, nor publish, restore, discard, archive or delete, nor
  -- create or revoke form passes (ADR-0004).
  begin
    perform 1 from public.teams;
    raise exception 'RLS check 9 failed: anon can read teams';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.team_members;
    raise exception 'RLS check 9 failed: anon can read team members';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.audit_log;
    raise exception 'RLS check 9 failed: anon can read the audit log';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.forms;
    raise exception 'RLS check 9 failed: anon can read forms';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.form_versions;
    raise exception 'RLS check 9 failed: anon can read form versions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.publish_form('00000000-0000-4000-8000-0000000000f2');
    raise exception 'RLS check 9 failed: anon can publish forms';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.restore_form_version('00000000-0000-4000-8000-0000000000f2', 1);
    raise exception 'RLS check 9 failed: anon can restore form versions';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.discard_draft_changes('00000000-0000-4000-8000-0000000000f2');
    raise exception 'RLS check 9 failed: anon can discard draft changes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.archive_form('00000000-0000-4000-8000-0000000000f2');
    raise exception 'RLS check 9 failed: anon can archive forms';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.unarchive_form('00000000-0000-4000-8000-0000000000f2');
    raise exception 'RLS check 9 failed: anon can unarchive forms';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.delete_form('00000000-0000-4000-8000-0000000000f2');
    raise exception 'RLS check 9 failed: anon can delete forms';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_form_pass('00000000-0000-4000-8000-0000000000f1',
      repeat('e', 64), 1, null, '{}');
    raise exception 'RLS check 9 failed: anon can create form passes';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.revoke_form_pass(gen_random_uuid());
    raise exception 'RLS check 9 failed: anon can revoke form passes';
  exception when insufficient_privilege then null;
  end;

  -- 32. The anon role has no privilege on any table, view or sequence of
  -- ours, and cannot call what /load-form and /dispatch-email call (ADR-0004).
  select string_agg(n.nspname || '.' || c.relname, ', ') into exposed
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'private')
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and case when c.relkind = 'S'
        then has_sequence_privilege('anon', c.oid, 'usage, select, update')
        else has_table_privilege('anon', c.oid,
               'select, insert, update, delete, truncate, references, trigger')
             or has_any_column_privilege('anon', c.oid,
               'select, insert, update, references')
      end;
  if exposed is not null then
    raise exception 'RLS check 32 failed: anon has a privilege on %', exposed;
  end if;
  -- Asked of the grants, not by calling: load_form runs as its caller, so a
  -- call would fail on the tables even with a stray grant.
  if has_function_privilege('anon', 'public.load_form(uuid)', 'execute') then
    raise exception 'RLS check 32 failed: anon can call load_form';
  end if;
  if has_function_privilege('anon', 'public.count_form_load(uuid)', 'execute') then
    raise exception 'RLS check 32 failed: anon can call count_form_load';
  end if;
  -- /dispatch-email's functions run as their owner, so a stray grant would
  -- let anyone read a form's recipients, mark a submission sent or failed,
  -- or learn a team's Team Admins.
  if has_function_privilege('anon', 'public.dispatch_submission(uuid, uuid, integer)', 'execute') then
    raise exception 'RLS check 32 failed: anon can call dispatch_submission';
  end if;
  if has_function_privilege('anon', 'public.mark_submission_sent(uuid)', 'execute') then
    raise exception 'RLS check 32 failed: anon can call mark_submission_sent';
  end if;
  if has_function_privilege('anon', 'public.record_delivery_failure(uuid, uuid, text)', 'execute') then
    raise exception 'RLS check 32 failed: anon can call record_delivery_failure';
  end if;
  if has_function_privilege('anon', 'public.delivery_retry_message(uuid)', 'execute') then
    raise exception 'RLS check 32 failed: anon can call delivery_retry_message';
  end if;
end $$;

reset role;

-- Shown as the result in the SQL editor; reached only if every check passed.
select 'RLS checklist passed: 46 of 46 checks' as result;

rollback;

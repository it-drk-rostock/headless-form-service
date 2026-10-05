-- Designer edits the draft (blueprint §3): team members save questions into
-- the form's single draft. Concurrent saves are last-write-wins. Visitors only
-- ever see the current version, so saving the draft changes nothing for them;
-- only publishing does (ticket 09).

-- File and signature questions are disabled for now: submissions travel
-- through QStash, whose size limit rules out base64 files
-- (.scratch/file-uploads/spec.md). The designer hides them; this refuses
-- them from any other path. Same list as lib/forms/draft.ts. Only element
-- types are checked: validators and triggers have a `type` too, but never
-- these values.
alter table public.forms
  add constraint forms_draft_schema_question_types_check
  check (
    not jsonb_path_exists(
      draft_schema,
      '$.** ? (@.type like_regex "^(file|signaturepad)$" flag "i")'
    )
  );

-- Who saved the draft and when, whichever path saved it, so nobody can
-- claim someone else did. A save that changes nothing keeps the old stamp.
create function private.stamp_draft()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.draft_schema is distinct from new.draft_schema
     or old.draft_email_template is distinct from new.draft_email_template then
    new.draft_updated_by := auth.uid();
    new.draft_updated_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.stamp_draft() from public;

create trigger forms_stamp_draft
  before update of draft_schema, draft_email_template on public.forms
  for each row execute function private.stamp_draft();

-- The questions are written by the designer. The email template gets its
-- write path with the email editor (ticket 17). Draft saves are not audited:
-- the log records publishing, which is what reaches visitors.
grant update (draft_schema) on public.forms to authenticated;

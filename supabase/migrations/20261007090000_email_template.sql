-- Standard Layout editor (blueprint §5): team members edit the subject and
-- body of their form's email template in the draft. Publishing freezes it
-- into the form version together with the questions (ADR-0003). Like the
-- questions, saves are last-write-wins, stamped by private.stamp_draft(),
-- and not audited: the log records publishing.

-- The shape the shared renderer reads (lib/shared/notification.ts), with
-- the limits of lib/forms/email-template.ts. Custom HTML (ticket 18) adds a
-- second mode.
alter table public.forms
  add constraint forms_draft_email_template_shape_check
  -- A missing key gives null, which a check lets through, hence coalesce.
  check (coalesce(
    draft_email_template ->> 'mode' = 'standard'
    and jsonb_typeof(draft_email_template -> 'subject') = 'string'
    and jsonb_typeof(draft_email_template -> 'body') = 'string'
    and length(draft_email_template ->> 'subject') <= 250
    and length(draft_email_template ->> 'body') <= 100000,
    false
  ));

-- The forms update policy already limits the rows to the person's teams.
grant update (draft_email_template) on public.forms to authenticated;

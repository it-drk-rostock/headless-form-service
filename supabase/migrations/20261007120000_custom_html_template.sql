-- Custom HTML Templates (blueprint §5.2): besides the Standard Layout, a
-- draft's email template can be the author's own HTML, in `body` like the
-- Standard Layout's body. The shape and limits stay those of
-- lib/forms/email-template.ts.
alter table public.forms
  drop constraint forms_draft_email_template_shape_check;

alter table public.forms
  add constraint forms_draft_email_template_shape_check
  -- A missing key gives null, which a check lets through, hence coalesce.
  check (coalesce(
    draft_email_template ->> 'mode' in ('standard', 'custom')
    and jsonb_typeof(draft_email_template -> 'subject') = 'string'
    and jsonb_typeof(draft_email_template -> 'body') = 'string'
    and length(draft_email_template ->> 'subject') <= 250
    and length(draft_email_template ->> 'body') <= 100000,
    false
  ));

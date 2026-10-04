# The email template is versioned together with the form's questions

Placeholders reference question names, so a template that lives outside the version silently breaks when a new version renames a question, and submissions still in the queue would render against the wrong template. Each form version therefore snapshots both the questions and the email template; the embed sends the version it rendered, and the dispatcher renders the notification email with that version's template. Recipients and the reply-to field stay on the form, since changing them should take effect immediately.

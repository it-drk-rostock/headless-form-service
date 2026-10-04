# 09: Publishing

**What to build:** A team member publishes the draft: it becomes a new immutable form version (questions plus email template) with an optional changelog, and becomes the current version. New forms start with a default email template (Standard Layout with a greeting and the answers table).

**Blocked by:** 08 (Designer edits the draft)

**Status:** ready-for-agent

- [ ] `form_versions` table, immutable, unique (form, version), strictly increasing numbers
- [ ] Publishing copies the draft's questions and email template into a new version and moves the current version, atomically
- [ ] A new form's draft starts with the default email template
- [ ] Publishing is recorded in the audit log
- [ ] A form without any version shows a clear 'not yet published' state

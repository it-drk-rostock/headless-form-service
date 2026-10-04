# 07: Create forms & form settings

**What to build:** Team members create forms for their teams and manage basic settings. `/forms` lists forms across all my teams; `/forms/[id]` shows a form's settings with its name and recipients.

**Blocked by:** 04 (Teams), 06 (Audit log)

**Status:** ready-for-agent

- [ ] `forms` table per the blueprint (draft fields, nullable current version, closed/archived fields, recipients, ...) with team RLS
- [ ] Creating a form asks which of my teams owns it
- [ ] `/forms` lists forms of all my teams with the team shown; archived forms excluded
- [ ] Name and recipients are editable; recipients are validated as email addresses
- [ ] Recipient changes are recorded in the audit log

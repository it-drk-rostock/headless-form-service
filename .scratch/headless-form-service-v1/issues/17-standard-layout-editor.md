# 17: Standard Layout editor

**What to build:** Team members design the notification email in the DRK Rostock-branded Standard Layout: a subject line plus a Mantine Tiptap WYSIWYG body. The editor lists the draft's SurveyJS questions for insertion as placeholders, plus basic elements (headings, text, lists, links, divider, answers table). A sandboxed iframe preview renders sample values through the shared renderer. The template lives in the draft and is versioned on publish (ADR-0003).

**Blocked by:** 09 (Publishing), 13 (Dispatcher sends the notification email)

**Status:** ready-for-agent

- [ ] The renderer supports the namespaced placeholders `{{answers.*}}`, `{{form.name}}`, `{{submitted_at}}`, `{{answers_table}}`
- [ ] The question list comes from the draft's questions; inserting adds the placeholder
- [ ] The preview uses the same shared renderer as the dispatcher
- [ ] The dispatcher uses the template of the submitted version
- [ ] Unknown placeholders are visibly flagged in the editor
- [ ] Renderer tests for each namespace

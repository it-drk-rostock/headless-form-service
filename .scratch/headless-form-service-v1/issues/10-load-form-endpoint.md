# 10: `/load-form` endpoint

**What to build:** The public loads a form's current version through `/load-form` (ADR-0004); the anon role has no table access. Requests from origins not on the allowed origins list are refused. Each load is counted per form and day.

**Blocked by:** 01 (Backend tooling), 09 (Publishing)

**Status:** ready-for-agent

- [ ] Handler with injected dependencies, covered by handler tests
- [ ] CORS allows only allowed origins (seeded in the `settings` row for now)
- [ ] Returns version number, questions and access type of the current version
- [ ] Unknown, unpublished or archived form -> 404
- [ ] `form_load_counts` incremented per form and day
- [ ] Verified that the anon role cannot read any table directly

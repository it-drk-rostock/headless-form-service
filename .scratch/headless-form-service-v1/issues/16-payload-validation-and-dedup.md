# 16: Payload validation & dedup

**What to build:** Submissions that are too big or invalid are rejected, and a network retry never produces a second email.

**Blocked by:** 12 (Submission is queued encrypted)

**Status:** ready-for-agent

- [ ] Payloads over 64 KB are rejected
- [ ] Required questions and basic types are checked against the version's questions -> 422, with a German message in the embed
- [ ] A repeated submission ID returns 202 without publishing again
- [ ] Validator unit tests in the shared module; handler tests for duplicates

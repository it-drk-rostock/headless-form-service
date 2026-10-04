# 14: Rate limiting

**What to build:** Visitors who hammer the endpoints are slowed down: Redis sliding-window limits per IP on `/load-form` and `/submit-form` (defaults 60/min and 10/min, read from settings). Redis is used for nothing else.

**Blocked by:** 12 (Submission is queued encrypted)

**Status:** ready-for-agent

- [ ] Exceeding a limit returns 429; the embed shows a German 'too many attempts' message
- [ ] Limits are read from the `settings` row
- [ ] Handler tests with a fake rate limiter

# 31: Failure list & retry

**What to build:** Team members see a form's delivery failures (metadata only) and can retry each one while QStash still retains it.

**Blocked by:** 30 (Delivery failure marking & alert)

**Status:** ready-for-agent

- [ ] Failure list per form: submission time, version, reason
- [ ] 'Retry delivery' replays the DLQ message; status goes back to queued, then sent
- [ ] Retry is unavailable once the DLQ message is gone, with an explanation
- [ ] Retries are recorded in the audit log

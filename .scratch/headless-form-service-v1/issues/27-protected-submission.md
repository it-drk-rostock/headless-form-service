# 27: Protected submission

**What to build:** Submitting a protected form uses up one use of the form pass, but only if the submission is actually accepted.

**Blocked by:** 12 (Submission is queued encrypted), 26 (Protected form loading)

**Status:** ready-for-agent

- [ ] The pass is claimed atomically (use count incremented only while still valid), otherwise 403
- [ ] If QStash publishing fails, the claim is released
- [ ] A single-use pass cannot be used twice, even with concurrent submissions
- [ ] The pass ID travels inside the encrypted payload
- [ ] Handler tests for claim, release and concurrency

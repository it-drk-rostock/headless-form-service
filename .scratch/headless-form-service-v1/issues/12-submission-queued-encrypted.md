# 12: Submission is queued encrypted

**What to build:** When a visitor completes a public form, the embed sends the answers to `/submit-form`, which encrypts them and queues them in QStash (ADR-0001). On 202 the embed shows SurveyJS's completion text; otherwise a German error. The embed creates a submission ID per form load and reuses it on retries.

**Blocked by:** 11 (`embed.js` shows a public form)

**Status:** ready-for-agent

- [ ] The request carries form, version, submission ID and answers
- [ ] Answers for keys that are not questions of that version are dropped
- [ ] A `form_stats` row (`queued`) is written with the submission ID; answers are stored nowhere
- [ ] Answers are AES-GCM encrypted with a key only edge functions hold; the QStash message contains only ciphertext and IDs
- [ ] QStash publish uses the submission ID as deduplication ID, with 3 retries
- [ ] If publishing fails, the stats row is removed and 503 returned
- [ ] Handler tests cover success, unknown keys, publish failure and unknown version

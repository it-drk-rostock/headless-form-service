# Encrypt submissions before they reach the queue

"Zero-PII" means submission answers are never readable at rest on infrastructure we control or rent for transport. QStash persists message bodies until delivery and keeps the full body in its dead-letter queue, so `/submit-form` encrypts the submission (AES-GCM, key held only by the edge functions) before publishing, and only the dispatcher decrypts it. Mailjet and the recipients' mailboxes are the explicit, documented exception: they are processors under a DPA, not part of the zero-PII promise.

## Consequences

- Dead-lettered submissions are unreadable to Upstash but can still be replayed by us while the key is unchanged; key rotation must keep old keys available for at least the DLQ retention window.
- Pass metadata is stored in Postgres, so it is restricted to flat string/number values and documented as "no personal data".

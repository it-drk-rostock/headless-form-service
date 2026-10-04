# n8n issues form passes through a narrow endpoint, not the database API

n8n is trusted, so a single global integration key is enough (no per-team keys). But it calls only the `/generate-form-pass` edge function, never PostgREST with the service-role key: that key bypasses all row-level security, and pass generation (entropy, hashing, expiry, use limits) must live in one place rather than be re-implemented in workflows.

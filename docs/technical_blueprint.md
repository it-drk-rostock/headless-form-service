# Technical Blueprint: Headless Form Service

> Vocabulary follows [`GLOSSARY.md`](../GLOSSARY.md). Decisions with lasting consequences are recorded in [`docs/adr/`](./adr/). Where this document and an ADR disagree, the ADR wins.

## 1. Overview

### 1.1 Purpose
Teams of DRK Rostock design forms, embed them in TYPO3 pages, and receive every submission as a notification email. The service never keeps submission answers.

### 1.2 Principles
* **Zero-PII**: Submission answers are never readable at rest on infrastructure we run or rent for transport. They are encrypted before queueing and only decrypted when the notification email is rendered. Mailjet and the recipients' mailboxes are documented processors outside this promise. ([ADR-0001](./adr/0001-encrypt-submissions-before-queueing.md))
* **EU hosting**: Everything that touches submissions runs in the EU. Forms must not collect special-category data (e.g. health data). ([ADR-0002](./adr/0002-eu-only-hosting.md))
* **Narrow public surface**: Visitors and n8n reach the backend only through edge functions. The anon role has no table access. ([ADR-0004](./adr/0004-public-access-only-through-edge-functions.md), [ADR-0005](./adr/0005-n8n-uses-a-narrow-endpoint.md))
* **Single cloud environment**: One Supabase project, one Upstash, and one Mailjet account serve both development and production. Only the dashboard runs locally. ([ADR-0006](./adr/0006-single-cloud-environment.md))
* **German throughout**: The dashboard, embed messages and email layout are German. The dashboard uses i18n keys, so other languages can be added later.

### 1.3 Topology

```
 TYPO3 page (HTML field)                    Dashboard (Next.js + Mantine, OpenNext on Cloudflare)
 <div data-form> + /embed.js                 SurveyJS Creator, email editor, teams, passes, stats
        │  load / submit                               │  Supabase Auth session + RLS
        ▼                                              ▼
 ┌───────────────────────── Supabase (EU) ─────────────────────────┐
 │ Edge: /load-form      Edge: /submit-form    Edge: /dispatch-email│
 │ Edge: /generate-form-pass (n8n)             Postgres + RLS       │
 └──────────┬───────────────────┬──────────────────────▲───────────┘
            │ rate limit        │ encrypted publish    │ signed delivery / failure callback
            ▼                   ▼                      │
      Upstash Redis (EU)   Upstash QStash (EU) ────────┘
                                                       │
                                                       ▼
                                          Mailjet (EU) → recipients
 Auth emails (invites, set-password links): IONOS SMTP via Supabase Auth custom SMTP
 Bot protection: Cloudflare Turnstile
```

### 1.4 Repository layout
* `app/`: Next.js dashboard.
* `supabase/migrations/`, `supabase/functions/`: database schema and Deno edge functions, deployed with the Supabase CLI.
* `embed/`: source of `embed.js` (bundles SurveyJS runner, theme, Turnstile, form-pass handling and submit logic), built with esbuild and served by the dashboard at `/embed.js`.
* Shared module (`lib/shared/`): the placeholder renderer, answers-table builder, and submission/pass types. The dashboard preview, the edge functions and the embed all use it, so the preview and the real email cannot drift apart.

---

## 2. People, Teams & Permissions

### 2.1 Roles

| Capability | Super Admin | Team Admin | Team Member | Visitor | n8n |
| :--- | :---: | :---: | :---: | :---: | :---: |
| Manage global settings (allowed origins, allowed recipient domains, rate limits) | Yes | No | No | No | No |
| Create teams, hard-delete teams/forms | Yes | No | No | No | No |
| Appoint Super Admins | Yes | No | No | No | No |
| Invite, remove, change role of team members | Yes | Own team | No | No | No |
| Send a new set-password link | Yes | Own team | No | No | No |
| Create / edit / publish / restore / close / archive forms | Yes | Yes | Yes | No | No |
| Edit email templates, recipients | Yes | Yes | Yes | No | No |
| Create / revoke form passes in dashboard | Yes | Yes | Yes | No | No |
| Create form passes via API | No | No | No | No | Yes |
| View statistics, delivery failures, retry delivery | Yes | Yes | Yes | No | No |
| View audit log | All | Own team | No | No | No |
| Load and submit forms | — | — | — | Via edge only | No |

### 2.2 Rules
* A person can belong to several teams, each with its own role (`team_admin` or `member`).
* A team can never lose its last Team Admin. Only a Super Admin can override this.
* RLS limits standard users to entities of teams they belong to. `is_super_admin` bypasses team boundaries.

### 2.3 Accounts
* Email and password through Supabase Auth. **Public sign-up is disabled**, so accounts exist only by invitation.
* No self-service password reset. A Super Admin or Team Admin sends a new set-password link from the dashboard.
* No MFA.
* Auth emails use **IONOS SMTP** configured as Supabase custom SMTP. (Supabase's built-in SMTP only reaches members of the Supabase organisation.) Mailjet is used only for notification emails and failure alerts.

---

## 3. Data Model (Supabase Postgres)

Submission answers are never stored. All timestamps are `timestamptz`.

#### `profiles`
`id` (PK, = `auth.users.id`), `email`, `full_name`, `is_super_admin` (default false), `created_at`, `updated_at`.

#### `teams`
`id`, `name`, `created_at`, `updated_at`.

#### `team_members`
`team_id` → teams (cascade), `user_id` → profiles (cascade), `role` (`team_admin` | `member`), `created_at`. Unique `(team_id, user_id)`.

#### `forms`
* `id` (UUID): referenced by the embed.
* `team_id` → teams.
* `name`.
* `access_type` (`public` | `protected`).
* `is_closed` (bool, default false): a **closed form** shows a closed notice and rejects submissions.
* `archived_at` (nullable): an **archived form** is hidden from lists and refuses loads and submissions, but keeps its versions and statistics.
* `page_url` (nullable): the **form page**, used to build form pass links.
* `recipients` (text[]): every address must match an allowed recipient domain.
* `reply_to_question` (nullable): name of the question whose answer becomes Reply-To.
* `sender_display_name`: shown together with the global sender address.
* `turnstile_enabled` (bool, default true).
* `draft_schema` (JSONB), `draft_email_template` (JSONB), `draft_updated_by`, `draft_updated_at`: the single **draft**. Concurrent saves are last-write-wins.
* `current_version` (int, nullable until first publish).

Recipients, reply-to, sender name, closed/archived and Turnstile live on the form, not the version, so they take effect immediately. ([ADR-0003](./adr/0003-email-template-versioned-with-form.md))

#### `form_versions` (immutable)
`id`, `form_id` → forms, `version` (int, strictly increasing), `schema` (SurveyJS JSON), `email_template` (JSONB, see §5), `changelog` (nullable), `created_by` → profiles, `created_at`. Unique `(form_id, version)`.

* **Publishing** inserts the draft as version `max+1` and sets `forms.current_version`.
* **Restoring** copies any version into the draft, and it is published as a new version.
* **Discarding changes** copies the current version into the draft.

#### `form_passes`
* `id`, `form_id` → forms.
* `token_hash` (unique): SHA-256 of the secret. The secret itself is shown **only once**, at creation.
* `max_uses` (int, nullable = unlimited until expiry; 1 = single-use), `use_count` (int, default 0).
* `expires_at` (nullable), `revoked_at` (nullable).
* `source` (`dashboard` | `n8n`), `created_by` (nullable).
* `metadata` (JSONB): **pass metadata**, a flat object of string or number values, documented as containing no personal data.

A pass is valid when it is not revoked, not expired, and `max_uses IS NULL OR use_count < max_uses`.

#### `form_stats` (one row per submission, kept indefinitely)
`id` (= submission ID generated by the embed), `form_id`, `version`, `status` (`queued` | `sent` | `failed`), `submitted_at`, `updated_at`, `failure_reason` (technical, contains no personal data), `qstash_message_id`.

#### `form_load_counts`
`form_id`, `day` (date), `count`. Incremented by `/load-form`.

#### `settings` (single row, Super Admin only)
`allowed_origins` (text[]), `allowed_recipient_domains` (text[]), `submit_rate_limit` (default 10/min/IP), `load_rate_limit` (default 60/min/IP).

#### `audit_log`
`id`, `team_id` (nullable), `actor_id` (nullable: system), `actor_email` (the actor's address when they acted), `action` (e.g. `member.added`), `entity_type`, `entity_id`, `details` (JSONB object, never submission data), `created_at`. Records publish/restore, recipient and form-setting changes, close/archive/delete, pass creation/revocation, membership and role changes. Append-only and without foreign keys, so entries outlive what they name. Written only through `private.record_audit()`, from triggers or database functions in the same transaction as the change.

---

## 4. Submission Pipeline

### 4.1 `/load-form` (public)
1. CORS: the request origin must be on `allowed_origins`.
2. Rate limit per IP (Redis sliding window).
3. Load the form. If it is archived → 404. If it is closed → return a `closed` state.
4. If the form is protected: validate the `form_pass` (without consuming it). If it is invalid → 403, and **no schema is returned**.
5. Increment `form_load_counts`.
6. Return `{ version, schema, access_type, turnstile_site_key? }` for the current version.

### 4.2 `/submit-form` (public)
Request: `{ form_id, version, submission_id, form_pass?, turnstile_token?, answers }`. The embed generates `submission_id` once per form load and reuses it on network retries.

1. CORS check, then rate limit per IP → 429.
2. Verify Turnstile (if enabled) and check the honeypot.
3. Load the form and the submitted version. Closed or archived → 4xx.
4. **Validate**: payload ≤ 64 KB. Answers for keys that are not questions of that version are dropped. Required and type checks are applied → 422.
5. Protected forms: **claim** the pass atomically (`UPDATE … SET use_count = use_count + 1 WHERE token_hash = … AND <valid> RETURNING id, metadata`). No row → 403.
6. Insert `form_stats` (`queued`) with `id = submission_id`. On conflict (a duplicate retry) → return 202 without publishing again.
7. **Encrypt** `{ answers, pass_id }` with AES-GCM (key held only by the edge functions).
8. Publish to QStash with deduplication ID = `submission_id`, retries and failure callback configured.
9. If publishing fails: release the pass claim (`use_count - 1`), delete the stats row, return 503.
10. Return **202**. To the visitor, an accepted submission means sent.

The embed shows SurveyJS's completion text on 202 and fixed German error messages otherwise (closed, invalid pass, too many attempts, validation, network).

### 4.3 QStash
* Retries: 3 attempts with exponential backoff.
* Deduplication on `submission_id`.
* Messages exhausted after retries go to the DLQ (retained 7 days). They are encrypted, so Upstash cannot read them.

### 4.4 `/dispatch-email` (QStash only)
1. Verify the `Upstash-Signature`.
2. Decrypt. Load the form (recipients, reply-to question, sender name), the version's email template, and the pass metadata.
3. Render subject and body with the shared renderer. **Every inserted value is HTML-escaped.**
4. Send through Mailjet Send API v3.1 from the global sender, with Reply-To taken from the configured question if its answer is a valid email address.
5. Mark `form_stats.status = sent`.

### 4.5 Delivery failures
* QStash failure callback → `/dispatch-email` (failure mode) marks the row `failed`, records a non-personal `failure_reason`, and emails the team's Team Admins (via Mailjet).
* The dashboard lists failed submissions per form (metadata only). **Retry delivery** replays the DLQ message while it is still retained.
* Encryption key rotation must keep old keys available for at least the DLQ retention window.

---

## 5. Email Templates

### 5.1 Placeholders (namespaced)
* `{{answers.<question_name>}}`: an answer from the submission.
* `{{pass.<key>}}`: pass metadata.
* `{{form.name}}`: a form property.
* `{{submitted_at}}`: localised (de-DE) timestamp.
* `{{answers_table}}`: all non-empty answers as a question/answer table.

### 5.2 Template modes
Stored in `form_versions.email_template` as `{ mode, subject, body }`:
* **Standard Layout** (default): a fixed, responsive DRK Rostock-branded layout. Staff edit the body in a **Mantine Tiptap** WYSIWYG editor. It lists the SurveyJS questions of the draft for insertion as placeholders, plus basic elements (headings, text, lists, links, divider, answers table). The default body is a greeting plus `{{answers_table}}`.
* **Custom HTML Template**: the author writes the complete HTML. Author HTML is trusted, inserted values are always escaped.

### 5.3 Preview
The editor previews with sample values through the shared renderer, inside a sandboxed `<iframe>`.

---

## 6. Embedding in TYPO3

Editors paste this into a TYPO3 HTML content element:

```html
<div data-form="<form-uuid>"></div>
<script src="https://<dashboard-domain>/embed.js" defer></script>
```

* `embed.js` is hosted centrally, so updates need no TYPO3 changes. If TYPO3 sends a Content-Security-Policy, it must allow the dashboard domain (script), the Supabase functions domain (connect), and Turnstile.
* Protected forms read `?form_pass=<secret>` from the page URL. If it is missing or invalid, the embed shows a German "link invalid" message, and no questions are loaded.
* Lifecycle: bootstrap → `/load-form` → `new Survey.Model(schema)` → `onComplete` → `/submit-form` → completion text or error.
* File and signature questions are disabled in the designer for now (see `.scratch/file-uploads/spec.md`).

---

## 7. Form Passes from n8n

`POST /generate-form-pass`, authenticated with a static Bearer key (`N8N_INTEGRATION_KEY`). It is global, not per team: n8n is trusted. n8n never receives the service-role key. ([ADR-0005](./adr/0005-n8n-uses-a-narrow-endpoint.md))

* **Input**: `form_id` (required, must be a protected form), `max_uses` (optional, default 1, `null` = unlimited), `expires_in_hours` (optional, default 48), `metadata` (optional, flat string/number values, no personal data).
* **Output**: `form_pass` (the secret, returned only here), `expires_at`, `url` (`<page_url>?form_pass=<secret>`, present when the form has a form page).

The dashboard offers the same options, and passes can be revoked there.

---

## 8. Statistics

* **Submission counts** per hour/day, from `form_stats`.
* **Delivery health**: sent vs failed.
* **Conversion**: `form_load_counts` vs submissions.
* **Per-version breakdown**: submissions per form version.
* Question-level analytics ("telemetry safe" answers) are out of scope.

---

## 9. Environment & Secrets

There is a single cloud environment ([ADR-0006](./adr/0006-single-cloud-environment.md)). The dashboard runs locally on `http://localhost:3000` against the cloud project. Migrations change only through files in `supabase/migrations/`.

| Secret | Used by |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Dashboard |
| `SUPABASE_SECRET_KEY` (secret key `sb_secret_…`, replaces the legacy `service_role` key) | Dashboard server only, for admin operations (invites, set-password links). Edge functions get secret keys injected by the runtime (`SUPABASE_SECRET_KEYS`) |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | `/load-form`, `/submit-form` |
| `QSTASH_TOKEN` | `/submit-form`, dashboard server (retry from DLQ) |
| `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | `/dispatch-email` |
| `SUBMISSION_ENCRYPTION_KEYS` | `/submit-form`, `/dispatch-email` |
| `TURNSTILE_SECRET_KEY` | `/submit-form` |
| `MAILJET_API_KEY`, `MAILJET_SECRET_KEY` | `/dispatch-email` |
| `N8N_INTEGRATION_KEY` | `/generate-form-pass` |
| `SUPABASE_AUTH_SMTP_USER`, `SUPABASE_AUTH_SMTP_PASS`, `SUPABASE_AUTH_SMTP_ADMIN_EMAIL` (IONOS) | Supabase Auth settings, set via `supabase config push` |

Open: the sender domain and address (`.scratch/sender-domain/spec.md`). A SurveyJS Creator commercial licence is to be bought before production use (development runs with the licence notice).

---

## 10. Dashboard Routes

`/teams`, `/teams/[id]`, `/forms` (forms across all of the person's teams), `/forms/[id]` (designer, email template, settings, passes, statistics, failures), plus Super Admin settings and audit log.

Look and feel (Monospace/Directus-style shell, DRK red as primary colour, components): [`docs/ui-design.md`](./ui-design.md).

---

## 11. Implementation Order

1. **Storage & security**: migrations for all tables, RLS, settings, audit log.
2. **Pipeline**: shared renderer, `/load-form`, `/submit-form` (rate limit, Turnstile, validation, pass claim, encryption, QStash), `/dispatch-email` with failure callback.
3. **Dashboard shell**: auth (invite-only), teams and membership, form list and settings.
4. **Designer & email**: SurveyJS Creator on the draft, publish/restore/discard, Standard Layout editor (Tiptap) and Custom HTML, preview.
5. **Passes & integrations**: pass management, `/generate-form-pass`, `embed.js`, statistics, failure list with retry.

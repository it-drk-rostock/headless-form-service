# Personalized form links from n8n

n8n calls the service to create a pass, then sends the returned link to the person completing the form. This works for a form embedded on your own website. No n8n workflow is provided or modified by this repository.

## Setup

1. Publish the form, set its access to **Geschützt**, and set **Formularseite** to the complete URL of the website page containing its embed.
2. Add that website's origin to the allowed origins in global settings.
3. Add the domains permitted to receive notification emails to the allowed recipient domains in global settings.
4. Generate a strong random integration secret. Store it in Supabase Edge Function secrets as `N8N_INTEGRATION_KEY` and as an n8n Header Auth credential. Its header name is `Authorization`; its value is `Bearer <your-secret>`. This is a dedicated integration secret, not a Supabase publishable, anon, service-role, or secret API key. The current integration key authorizes pass generation across all protected forms: keep it in server-side n8n credentials.
5. Configure the existing `SUBMISSION_ENCRYPTION_KEYS` secret for `generate-form-pass` and `load-form` as well as `submit-form` and `dispatch-email`. All four must share the same key ring. The existing format is `key-id:base64-encoded-32-byte-key`, with comma-separated entries for rotation; the first key encrypts new data.

The request URL is:

```text
https://<project-ref>.supabase.co/functions/v1/generate-form-pass
```

Use the base project URL configured as `NEXT_PUBLIC_SUPABASE_URL`. Deploy the migration `20261022144119_pass_personalization.sql`, the four functions above, and rebuild and deploy `embed.js` before using the new fields. Existing metadata-only requests remain supported. This guide does not imply deployment has already happened.

## HTTP Request node

Set the method to `POST`, use the Header Auth credential above, and send JSON with `Content-Type: application/json`:

```json
{
  "form_id": "<protected-form-uuid>",
  "max_uses": 1,
  "expires_in_hours": 48,
  "metadata": {
    "ticket": "T-4711",
    "campaign": "Herbst 2026"
  },
  "prefill": {
    "email": "m.max@drk-rostock.de",
    "course": "Erste Hilfe"
  },
  "locked_fields": ["email"],
  "recipient": "kurse@drk-rostock.de"
}
```

**All values can be dynamic n8n expressions.** For example, map `metadata.ticket` to `{{ $json.ticket_id }}`, `prefill.email` to `{{ $json.email }}`, and `recipient` to `{{ $json.notification_recipient }}` in the HTTP Request node. Select expression mode for the appropriate values or build the whole JSON object as an expression. The service receives the evaluated JSON, not the expression text.

| Field | Meaning |
| --- | --- |
| `form_id` | UUID of the protected form. |
| `max_uses` | Defaults to 1; `null` means unlimited; maximum 10000. |
| `expires_in_hours` | Defaults to 48; positive whole number up to 8760. Every n8n pass expires. |
| `metadata` | Optional non-personal context for email placeholders such as `{{pass.ticket}}`. Does not automatically fill questions or control delivery. |
| `prefill` | Optional initial answers, keyed by question name (or SurveyJS `valueName`, if configured). Keys must exist in the current published version; values must match the question's basic answer type. |
| `locked_fields` | Names from `prefill` that the visitor cannot change. Omit this to lock **all** prefilled fields. Send `[]` to make all prefilled fields editable. In the example, `email` is locked and `course` is editable. |
| `recipient` | Optional notification destination for this pass. Replaces the form's fixed recipients for this submission. Omit it or send `null` to use the fixed recipients from Einstellungen. |

`metadata` and `prefill` each accept at most 20 string or number entries, with at most 500 characters per string. Keys use letters, digits, `_`, and `-`, up to 50 characters. Complex answers such as checkbox arrays and nested panels are not supported as prefill values in this API. No personal data belongs in `metadata`; put personal initial answers in `prefill` instead.

The prefilled `email` question and `recipient` are independent. A question's email value becomes Reply-To only if that question is selected in the form's Reply-To setting. To use the same address for a locked question and delivery, n8n supplies it in both places. The person receiving the link can be different from the notification recipient; n8n decides whom it sends the link to.

## Response and embedded forms

Successful creation returns HTTP 201:

```json
{
  "form_pass": "<secret>",
  "expires_at": "2026-10-24T12:00:00.000Z",
  "url": "https://your-website.de/formular?form_pass=<secret>"
}
```

Send `url` to the person. It is built from **Formularseite**, preserving existing query parameters. If Formularseite is unset, `url` is omitted; configure it before using the workflow. The secret is returned only once.

The standard embed reads `form_pass` from the hosting page's URL and includes it when loading and submitting. Use a direct link to that hosting page; personal field values and recipient addresses are not placed in its query string. For an iframe, the pass must reach the iframe document's URL, since the embed reads its own window's URL.

The holder of a valid pass can view its initial answers. Treat the link as a bearer credential: anyone with it can use it within its use and expiry limits. A pass grants access to one form. Several protected embeds on one page cannot share a pass for different forms.

## Server enforcement and delivery

- The server validates the pass's form, expiry, revocation, and remaining uses.
- Initial answers are returned only with a valid pass. The recipient is never included in the public load response.
- The embed fills the questions and marks locked ones read-only. The server independently rejects a changed locked answer with HTTP 422 `answers_invalid`, without consuming a pass use. Missing locked answers are restored from the stored pass, including answers hidden by form conditions.
- Before email delivery, the server checks locked values again and reads the recipient from the stored encrypted pass context. Client-supplied routing properties cannot change it.
- The recipient must belong to a globally allowed recipient domain at generation **and** at delivery. A domain removed after generation stops delivery; it does not trigger fallback to fixed recipients.
- Without a pass-specific recipient, the form's current fixed recipients apply. Dynamic routing can work even when the form has no fixed recipients.
- If encryption keys or stored context cannot be read, the request fails; the service does not silently accept editable values or switch recipients.
- If publishing changes removes or changes the type of a prefilled question, regenerate the affected passes. Submission checks prefill compatibility against the submitted version.

Generation errors include 400 `request_invalid` (with `field`, including `pass_context` for invalid prefill/locks/recipient syntax), 401 `unauthorized`, 404 `form_not_found`, 409 `form_not_protected`, and 422 `prefill_invalid` or `recipient_not_allowed`. Personalization requires a published form. Correct the input before retrying creation; generating twice creates two passes.

## Storage and key rotation

Personal initial answers, lock rules, and the recipient are AES-256-GCM encrypted in `form_passes.encrypted_context`, bound to the form ID and pass token hash. Authenticated dashboard users cannot select this column. Metadata remains separate and visible in the existing Pässe list; existing dashboard pass creation continues to create metadata-only passes.

This extends the service's persistence model: personal initial values are retained encrypted with the pass, even after use, revocation, or expiry, until that pass or its form is deleted. Submitted answers remain transient and encrypted in the delivery queue. No automatic purge is introduced here. Set an operational deletion policy appropriate to the data you pass. Keep old encryption keys available for all retained passes and queued submissions; removing an old key makes affected links and deliveries unreadable.

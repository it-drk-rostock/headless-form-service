// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.
import { Client } from "npm:@upstash/qstash@2.12.0";
import { createRateLimiter } from "../_shared/redis.ts";
import {
  createServiceClient,
  dispatchEmailUrl,
  loadStoredPassContext,
  readEndpointSettings,
} from "../_shared/service.ts";
import {
  encryptSubmission,
  parseEncryptionKeys,
} from "../_shared/submission-crypto.ts";
import { createTurnstileVerifier } from "../_shared/turnstile.ts";
import { handleSubmitForm, type SubmittedForm } from "./handler.ts";

const supabase = createServiceClient("submit-form");
const withinRateLimit = createRateLimiter("submit-form");

// Set with `supabase secrets set` (README, "Submitting forms"). QStash's
// default URL is its EU region (ADR-0002).
const qstashToken = Deno.env.get("QSTASH_TOKEN");
const encryptionKeys = Deno.env.get("SUBMISSION_ENCRYPTION_KEYS");
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
if (!qstashToken || !encryptionKeys || !turnstileSecret) {
  throw new Error(
    "submit-form needs the secrets QSTASH_TOKEN, SUBMISSION_ENCRYPTION_KEYS and TURNSTILE_SECRET_KEY.",
  );
}
const verifyTurnstile = createTurnstileVerifier(turnstileSecret);
const keys = await parseEncryptionKeys(encryptionKeys);
const qstash = new Client({
  token: qstashToken,
  baseUrl: Deno.env.get("QSTASH_URL") || undefined,
  // The visitor waits on this: two quick retries, not the SDK's five (about
  // 12 s). The deduplication ID makes a retried publish safe.
  retry: { retries: 2 },
});
// Where QStash delivers each submission, and its failure callback once the
// retries are used up (blueprint §4.5).
const dispatchUrl = dispatchEmailUrl();

Deno.serve((request) =>
  handleSubmitForm(request, {
    settings: () => readEndpointSettings(supabase, "submit"),
    withinRateLimit,
    loadVersion: async (formId, version) => {
      const { data, error } = await supabase
        .rpc("submission_form", { form: formId, version })
        .maybeSingle<{
          schema: unknown;
          access_type: SubmittedForm["accessType"];
          turnstile_enabled: boolean;
          is_closed: boolean;
        }>();
      if (error) throw error;
      return data === null
        ? null
        : {
            schema: data.schema,
            accessType: data.access_type,
            turnstileEnabled: data.turnstile_enabled,
            isClosed: data.is_closed,
          };
    },
    loadPassContext: (formId, passId) =>
      loadStoredPassContext(supabase, keys, formId, passId),
    verifyTurnstile,
    claimPass: async ({ formId, submissionId }, tokenHash) => {
      const { data, error } = await supabase
        .rpc("claim_form_pass", {
          form: formId,
          token_hash: tokenHash,
          submission: submissionId,
        })
        .maybeSingle<{ id: string }>();
      if (error) throw error;
      return data?.id ?? null;
    },
    finishPass: async (submissionId, accepted) => {
      const { error } = await supabase.rpc("finish_form_pass_claim", {
        submission: submissionId,
        accepted,
      });
      if (error) throw error;
    },
    queue: async ({ submissionId, formId, version }) => {
      const { data, error } = await supabase.rpc("queue_submission", {
        submission: submissionId,
        form: formId,
        version,
      });
      if (error) throw error;
      return data === true;
    },
    unqueue: async (submissionId) => {
      const { error } = await supabase.rpc("unqueue_submission", {
        submission: submissionId,
      });
      if (error) throw error;
    },
    recordMessage: async (submissionId, messageId) => {
      const { error } = await supabase.rpc("record_queued_message", {
        submission: submissionId,
        message: messageId,
      });
      if (error) throw error;
    },
    encrypt: (ids, payload) => encryptSubmission(keys, ids, payload),
    publish: ({ body, deduplicationId, retries }) =>
      qstash.publishJSON({
        url: dispatchUrl,
        body,
        deduplicationId,
        retries,
        failureCallback: dispatchUrl,
      }),
  }),
);

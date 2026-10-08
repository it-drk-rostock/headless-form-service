// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.
import { Receiver } from "npm:@upstash/qstash@2.12.0";
import type { PassMetadata } from "../../../lib/shared/form-pass.ts";
import { createMailjetSender } from "../_shared/mailjet.ts";
import { createServiceClient, dispatchEmailUrl } from "../_shared/service.ts";
import {
  decryptSubmission,
  parseEncryptionKeys,
} from "../_shared/submission-crypto.ts";
import { type DispatchedSubmission, handleDispatchEmail } from "./handler.ts";

const supabase = createServiceClient("dispatch-email");

// Set with `supabase secrets set` (README, "Delivering submissions").
function secret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`dispatch-email needs the secret ${name}.`);
  return value;
}

const keys = await parseEncryptionKeys(secret("SUBMISSION_ENCRYPTION_KEYS"));
const receiver = new Receiver({
  currentSigningKey: secret("QSTASH_CURRENT_SIGNING_KEY"),
  nextSigningKey: secret("QSTASH_NEXT_SIGNING_KEY"),
});
const url = dispatchEmailUrl();
const send = createMailjetSender({
  apiKey: secret("MAILJET_API_KEY"),
  secretKey: secret("MAILJET_SECRET_KEY"),
});
const senderEmail = secret("NOTIFICATION_SENDER_EMAIL");

Deno.serve((request) =>
  handleDispatchEmail(request, {
    verifySignature: async (signature, body) => {
      try {
        // Also checks that QStash signed it for this function's URL.
        return await receiver.verify({ signature, body, url });
      } catch {
        return false;
      }
    },
    decrypt: (ids, envelope) => decryptSubmission(keys, ids, envelope),
    loadSubmission: async ({ submissionId, formId, version }) => {
      const { data, error } = await supabase
        .rpc("dispatch_submission", {
          submission: submissionId,
          form: formId,
          version,
        })
        .maybeSingle<{
          form_name: string;
          recipients: string[];
          schema: unknown;
          email_template: unknown;
          submitted_at: string;
          status: DispatchedSubmission["status"];
          sender_display_name: string;
          reply_to_question: string | null;
          allowed_recipient_domains: string[];
        }>();
      if (error) throw error;
      return data === null
        ? null
        : {
            formName: data.form_name,
            recipients: data.recipients,
            template: data.email_template,
            schema: data.schema,
            submittedAt: new Date(data.submitted_at),
            status: data.status,
            senderDisplayName: data.sender_display_name,
            replyToQuestion: data.reply_to_question,
            allowedRecipientDomains: data.allowed_recipient_domains,
          };
    },
    loadPassMetadata: async (formId, passId) => {
      const { data, error } = await supabase
        .from("form_passes")
        .select("metadata")
        .eq("form_id", formId)
        .eq("id", passId)
        .maybeSingle<{ metadata: PassMetadata }>();
      if (error) throw error;
      return data?.metadata ?? null;
    },
    send,
    markSent: async (submissionId) => {
      const { error } = await supabase.rpc("mark_submission_sent", {
        submission: submissionId,
      });
      if (error) throw error;
    },
    senderEmail,
  }),
);

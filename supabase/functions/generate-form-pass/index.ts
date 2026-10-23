// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.
import { prefillFitsSchema } from "../../../lib/shared/pass-context.ts";
import { isAllowedRecipient } from "../../../lib/shared/recipient-domains.ts";
import { encryptPassContext } from "../_shared/pass-context.ts";
import { createServiceClient } from "../_shared/service.ts";
import { parseEncryptionKeys } from "../_shared/submission-crypto.ts";
import { handleGenerateFormPass } from "./handler.ts";

const supabase = createServiceClient("generate-form-pass");

// Raised by public.create_n8n_form_pass().
const FORM_NOT_FOUND = "HF011"; // unknown or archived
const FORM_NOT_PROTECTED = "HF010";

// Set with `supabase secrets set` (README, "Form passes from n8n"); a stray
// newline from pasting would otherwise refuse every request.
const integrationKey = Deno.env.get("N8N_INTEGRATION_KEY")?.trim();
if (!integrationKey) {
  throw new Error("generate-form-pass needs the secret N8N_INTEGRATION_KEY.");
}

const keys = await parseEncryptionKeys(
  Deno.env.get("SUBMISSION_ENCRYPTION_KEYS") ?? "",
);

Deno.serve((request) =>
  handleGenerateFormPass(request, {
    integrationKey,
    now: Date.now,
    createPass: async (pass) => {
      if (pass.context) {
        const { data: version, error: versionError } = await supabase
          .rpc("load_form", { form: pass.formId })
          .maybeSingle<{ schema: unknown }>();
        if (versionError) throw versionError;
        if (!version) return "form_not_found";
        if (!prefillFitsSchema(version.schema, pass.context))
          return "prefill_invalid";
        if (pass.context.recipient) {
          const { data: settings, error } = await supabase
            .from("settings")
            .select("allowed_recipient_domains")
            .single<{ allowed_recipient_domains: string[] }>();
          if (error) throw error;
          if (
            !isAllowedRecipient(
              pass.context.recipient,
              settings.allowed_recipient_domains,
            )
          )
            return "recipient_not_allowed";
        }
      }
      const encrypted = pass.context
        ? await encryptPassContext(
            keys,
            pass.formId,
            pass.tokenHash,
            pass.context,
          )
        : null;
      const { data, error } = await supabase.rpc(
        encrypted
          ? "create_personalized_n8n_form_pass"
          : "create_n8n_form_pass",
        {
          ...(encrypted ? { encrypted_context: encrypted } : {}),
          form: pass.formId,
          token_hash: pass.tokenHash,
          max_uses: pass.maxUses,
          expires_at: pass.expiresAt,
          metadata: pass.metadata,
        },
      );
      if (error?.code === FORM_NOT_FOUND) return "form_not_found";
      if (error?.code === FORM_NOT_PROTECTED) return "form_not_protected";
      if (error) throw error;
      return { pageUrl: data as string | null };
    },
  }),
);

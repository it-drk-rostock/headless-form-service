// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.
import { createServiceClient } from "../_shared/service.ts";
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

Deno.serve((request) =>
  handleGenerateFormPass(request, {
    integrationKey,
    now: Date.now,
    createPass: async (pass) => {
      const { data, error } = await supabase.rpc("create_n8n_form_pass", {
        form: pass.formId,
        token_hash: pass.tokenHash,
        max_uses: pass.maxUses,
        expires_at: pass.expiresAt,
        metadata: pass.metadata,
      });
      if (error?.code === FORM_NOT_FOUND) return "form_not_found";
      if (error?.code === FORM_NOT_PROTECTED) return "form_not_protected";
      if (error) throw error;
      return { pageUrl: data as string | null };
    },
  }),
);

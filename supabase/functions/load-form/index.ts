// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.

import { decryptPassContext } from "../_shared/pass-context.ts";
import { createRateLimiter } from "../_shared/redis.ts";
import {
  createServiceClient,
  readEndpointSettings,
} from "../_shared/service.ts";
import {
  type EncryptedSubmission,
  parseEncryptionKeys,
} from "../_shared/submission-crypto.ts";
import {
  handleLoadForm,
  type LoadedForm,
  type LoadedFormPass,
} from "./handler.ts";

const keys = await parseEncryptionKeys(
  Deno.env.get("SUBMISSION_ENCRYPTION_KEYS") ?? "",
);
const supabase = createServiceClient("load-form");
const withinRateLimit = createRateLimiter("load-form");

// Public, but set with `supabase secrets set` like the rest (README,
// "Bot protection").
const turnstileSiteKey = Deno.env.get("TURNSTILE_SITE_KEY");
if (!turnstileSiteKey) {
  throw new Error("load-form needs the secret TURNSTILE_SITE_KEY.");
}

Deno.serve((request) =>
  handleLoadForm(request, {
    settings: () => readEndpointSettings(supabase, "load"),
    withinRateLimit,
    now: Date.now,
    loadPass: async (formId, tokenHash) => {
      const { data, error } = await supabase
        .from("form_passes")
        .select(
          "max_uses, use_count, expires_at, revoked_at, encrypted_context",
        )
        .eq("form_id", formId)
        .eq("token_hash", tokenHash)
        .maybeSingle<
          LoadedFormPass & { encrypted_context: EncryptedSubmission | null }
        >();
      if (error) throw error;
      if (!data) return null;
      const { encrypted_context, ...pass } = data;
      return {
        ...pass,
        context: encrypted_context
          ? await decryptPassContext(keys, formId, tokenHash, encrypted_context)
          : null,
      };
    },
    loadForm: async (formId) => {
      const { data, error } = await supabase
        .rpc("load_form", { form: formId })
        .maybeSingle<{
          version: number;
          schema: unknown;
          theme: Record<string, unknown> | null;
          access_type: LoadedForm["accessType"];
          turnstile_enabled: boolean;
          is_closed: boolean;
        }>();
      if (error) throw error;
      return data === null
        ? null
        : {
            version: data.version,
            schema: data.schema,
            theme: data.theme,
            accessType: data.access_type,
            turnstileEnabled: data.turnstile_enabled,
            isClosed: data.is_closed,
          };
    },
    countLoad: async (formId) => {
      const { error } = await supabase.rpc("count_form_load", { form: formId });
      if (error) throw error;
    },
    turnstileSiteKey,
  }),
);

// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.
import { createRateLimiter } from "../_shared/redis.ts";
import {
  createServiceClient,
  readEndpointSettings,
} from "../_shared/service.ts";
import { handleLoadForm, type LoadedForm } from "./handler.ts";

const supabase = createServiceClient("load-form");
const withinRateLimit = createRateLimiter("load-form");

Deno.serve((request) =>
  handleLoadForm(request, {
    settings: () => readEndpointSettings(supabase, "load"),
    withinRateLimit,
    loadForm: async (formId) => {
      const { data, error } = await supabase
        .rpc("load_form", { form: formId })
        .maybeSingle<{
          version: number;
          schema: unknown;
          access_type: LoadedForm["accessType"];
        }>();
      if (error) throw error;
      return data === null
        ? null
        : {
            version: data.version,
            schema: data.schema,
            accessType: data.access_type,
          };
    },
    countLoad: async (formId) => {
      const { error } = await supabase.rpc("count_form_load", { form: formId });
      if (error) throw error;
    },
  }),
);

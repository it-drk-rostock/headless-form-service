// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { handleLoadForm, type LoadedForm } from "./handler.ts";

// The runtime injects the project's secret keys as a JSON dictionary. The
// secret key acts as `service_role`, the only role allowed to read settings
// and call `load_form` / `count_form_load` (ADR-0004).
const url = Deno.env.get("SUPABASE_URL");
const secretKey = JSON.parse(
  Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}",
).default;
if (!url || !secretKey) {
  throw new Error(
    "load-form needs SUPABASE_URL and SUPABASE_SECRET_KEYS, which the Supabase runtime injects.",
  );
}
const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve((request) =>
  handleLoadForm(request, {
    allowedOrigins: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("allowed_origins")
        .maybeSingle();
      if (error) throw error;
      return data?.allowed_origins ?? [];
    },
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

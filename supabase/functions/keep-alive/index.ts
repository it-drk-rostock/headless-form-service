// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.
import { Client } from "npm:@upstash/qstash@2.12.0";
import { createRateLimiter } from "../_shared/redis.ts";
import { createServiceClient } from "../_shared/service.ts";
import { handleKeepAlive, type KeepAliveDbResult } from "./handler.ts";

const supabase = createServiceClient("keep-alive");
const withinRateLimit = createRateLimiter("keep-alive");

const authKey = Deno.env.get("KEEPALIVE_KEY")?.trim();
const qstashToken = Deno.env.get("QSTASH_TOKEN")?.trim();

const qstash = qstashToken
  ? new Client({
      token: qstashToken,
      baseUrl: Deno.env.get("QSTASH_URL") || undefined,
      retry: { retries: 0 },
    })
  : null;

const pingUrl = new URL("/functions/v1/ping", Deno.env.get("SUPABASE_URL")).href;

Deno.serve((request) =>
  handleKeepAlive(request, {
    now: () => new Date(),
    authKey,
    withinRateLimit,
    touchDb: async (source) => {
      const { data, error } = await supabase.rpc("touch_keep_alive", {
        source_name: source,
      });
      if (error) throw error;
      return data as KeepAliveDbResult;
    },
    pingQStash: qstash
      ? async () => {
          await qstash.publish({
            url: pingUrl,
            method: "GET",
            retries: 0,
          });
        }
      : undefined,
  }),
);

// Thin Deno entry point: wire real dependencies into the portable handler.
// All logic lives in handler.ts, which is tested under Vitest with fakes.
import { handlePing } from "./handler.ts";

Deno.serve((request) => handlePing(request, { now: () => new Date() }));

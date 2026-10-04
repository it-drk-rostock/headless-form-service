import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: every dashboard page is per-user and rendered on request.
export default defineCloudflareConfig({});

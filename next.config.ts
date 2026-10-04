import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // A config redirect, not a prerendered page, so the CDN does not cache it for a year.
  async redirects() {
    return [{ source: "/", destination: "/forms", permanent: false }];
  },
};

export default nextConfig;

// Gives `next dev` access to Cloudflare bindings (wrangler.jsonc), as in the deployed worker.
import("@opennextjs/cloudflare").then((m) => m.initOpenNextCloudflareForDev());

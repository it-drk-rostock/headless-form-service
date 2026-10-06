// `npm run build:embed`: writes `public/embed.js`, which the dashboard serves
// at `/embed.js`. Runs before `npm run dev` and `npm run build`. Takes
// NEXT_PUBLIC_SUPABASE_URL from the environment, else from `.env.local`.
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { bundleEmbed } from "./bundle.mts";

const root = new URL("../", import.meta.url);
const envFile = new URL(".env.local", root);
// Values already in the environment win, as in Next.js.
if (existsSync(envFile)) process.loadEnvFile(envFile);

const script = await bundleEmbed({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
});

const publicDir = new URL("public/", root);
await mkdir(publicDir, { recursive: true });
await writeFile(new URL("embed.js", publicDir), script);
console.log("embed: wrote public/embed.js");

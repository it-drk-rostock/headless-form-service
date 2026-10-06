// Bundles `embed.js` (blueprint §1.4): the embed source, the SurveyJS form library
// and its theme in one classic script, which TYPO3 pages load with a plain
// `<script src defer>`.
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

export async function bundleEmbed({
  supabaseUrl,
}: {
  supabaseUrl: string;
}): Promise<string> {
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is needed to build embed.js");
  }

  const result = await build({
    entryPoints: [fileURLToPath(new URL("./main.ts", import.meta.url))],
    outfile: "embed.js",
    write: false,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2020",
    minify: true,
    loader: { ".css": "text" },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      __LOAD_FORM_URL__: JSON.stringify(
        new URL("/functions/v1/load-form", supabaseUrl).href,
      ),
      __SUBMIT_FORM_URL__: JSON.stringify(
        new URL("/functions/v1/submit-form", supabaseUrl).href,
      ),
    },
    logLevel: "silent",
  });

  // Code splitting is off, so this is one file. TYPO3 pages load nothing else.
  const [script] = result.outputFiles;
  return script.text;
}

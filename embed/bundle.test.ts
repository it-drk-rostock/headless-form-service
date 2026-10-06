import { describe, expect, it } from "vitest";
import { bundleEmbed } from "./bundle.mts";

describe("bundleEmbed", () => {
  it("builds one self-contained script with the form library, theme and endpoint", async () => {
    const script = await bundleEmbed({
      supabaseUrl: "https://project.supabase.co",
    });

    // A classic script: TYPO3 loads it with a plain <script src defer>.
    expect(script).not.toMatch(/^\s*(import|export)\s/m);
    expect(script).toContain(
      "https://project.supabase.co/functions/v1/load-form",
    );
    // SurveyJS's default theme, bundled rather than loaded from elsewhere.
    expect(script).toContain(".sd-root-modern");
  }, 30_000);

  it("refuses to build without the Supabase URL", async () => {
    await expect(bundleEmbed({ supabaseUrl: "" })).rejects.toThrow(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "app/**/*.test.ts",
      "embed/**/*.test.ts",
      "lib/**/*.test.ts",
      "supabase/functions/**/*.test.ts",
      "supabase/tests/**/*.test.ts",
    ],
    environment: "node",
  },
});

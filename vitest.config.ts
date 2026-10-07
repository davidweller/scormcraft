import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Clears live credentials that Vite picks up from .env, so no test can
    // reach real Blob storage or the real database. See test/setup.ts.
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      // Every module in src uses the "@/" path alias from tsconfig.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

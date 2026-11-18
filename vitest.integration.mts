import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Pruebas de integración: usan una base PostgreSQL real (crm_test). Ver scripts/test-integration.mjs. */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    // Las pruebas comparten la misma base: se ejecutan una tras otra.
    fileParallelism: false,
    testTimeout: 30_000,
  },
});

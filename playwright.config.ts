import { defineConfig, devices } from "@playwright/test";

/**
 * Pruebas E2E en navegador real (Chromium). Se ejecutan con `npm run test:e2e`, que prepara
 * una base desechable con datos ficticios (crm_e2e), compila y luego llama a Playwright.
 * Ver scripts/test-e2e.mjs y ADR 0018.
 */
const PORT = Number(process.env.E2E_PORT ?? 3200);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // Los flujos comparten la misma base: en orden y sin paralelismo.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results/e2e",
  use: {
    baseURL: BASE_URL,
    locale: "es-US",
    timezoneId: "America/New_York",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "test-results/e2e/.auth/admin.json" },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${BASE_URL}/es/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { BETTER_AUTH_URL: BASE_URL },
  },
});

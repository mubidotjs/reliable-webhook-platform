import { defineConfig } from "@playwright/test";

const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;
const databaseURL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54329/reliable_webhooks?schema=public";
const authSecret =
  process.env.BETTER_AUTH_SECRET ??
  "development-only-secret-change-before-deploying";

export default defineConfig({
  testDir: "apps/web/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "line",
  globalSetup: "./apps/web/e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure" },
  webServer: {
    command: `pnpm --filter @rwp/web start --port ${port}`,
    url: `${baseURL}/api/health/live`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: databaseURL,
      DIRECT_URL: process.env.DIRECT_URL ?? databaseURL,
      BETTER_AUTH_SECRET: authSecret,
      BETTER_AUTH_URL: baseURL,
      GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "e2e-not-used",
      GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? "e2e-not-used",
      ENCRYPTION_KEY_VERSION: "v1",
      ENCRYPTION_KEY_V1:
        process.env.ENCRYPTION_KEY_V1 ??
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    },
  },
});

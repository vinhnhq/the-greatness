/**
 * E2E smoke — UI-driven like a real customer, no API cheats.
 *
 * The suite starts its own dev server against a scratch SQLite file and the
 * dev sign-in bypass, so it needs no cloud account and cannot touch the
 * database you were just clicking around in.
 */

import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `bun run e2e:server`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      DATABASE_DRIVER: "sqlite",
      DATABASE_FILE: ".data/e2e.db",
      STORAGE_DRIVER: "local",
      STORAGE_DIR: ".data/e2e-uploads",
      ALLOW_DEV_LOGIN: "1",
      BETTER_AUTH_SECRET: "e2e-only-not-a-real-secret",
    },
  },
});

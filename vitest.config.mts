/**
 * Two projects, deliberately separated:
 *
 *   unit        — pure `src/lib/**` logic. No database, no DOM `File`, no
 *                 network. Fast enough to run on every save.
 *   integration — repositories and migrations against a REAL database. By
 *                 default a scratch `bun:sqlite` file (so this needs no
 *                 secret and no Docker); point `DATABASE_TEST_URL` at a Neon
 *                 branch to additionally exercise the Postgres dialect.
 *
 * `test:coverage` runs BOTH plus the thresholds — that is the gate. A bare
 * `test` run skips thresholds and can go green on uncovered code.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
  // Native `@/*` resolution from tsconfig — the `vite-tsconfig-paths` plugin
  // this replaced now warns that Vite does it itself.
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          include: ["src/tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "integration",
          include: ["src/tests/integration/**/*.test.ts"],
          environment: "node",
          // Each file gets its own scratch database; running them in one
          // process keeps the file handles predictable.
          fileParallelism: false,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // The pure layer is what the thresholds are for. Everything that only
      // exists to touch React, Next or the network is excluded rather than
      // padded with tests that assert the framework works.
      include: ["src/lib/**/*.ts"],
      // Excluded because a Node test can only reach these through a mock,
      // and a test of a mock is a test of nothing. Each one is deliberately
      // decision-free — the logic they would otherwise contain lives in a
      // sibling module that IS measured (`upload.ts` beside `local.ts`,
      // `optimize-image.ts` beside `optimize-image.browser.ts`).
      exclude: [
        // Type declarations and driver construction.
        "src/lib/db.ts",
        "src/lib/db-types.ts",
        "src/lib/storage/types.ts",
        // Next.js / better-auth boundaries — exercised by the E2E smoke.
        "src/lib/auth.ts",
        "src/lib/auth-client.ts",
        "src/lib/require-user.ts",
        "src/lib/env-server.ts",
        "src/lib/env-client.ts",
        // Browser-only adapters: canvas, <video>, XHR, Vercel Blob's client.
        "src/lib/media/*.browser.ts",
        "src/lib/storage/local.ts",
        "src/lib/storage/blob.ts",
        "src/lib/storage/index.ts",
        // Tailwind class merging.
        "src/lib/utils.ts",
        "src/lib/**/*.test.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});

/**
 * Kysely migration runner — `bun run migrate <command>`.
 *
 *   bun run migrate latest    run every pending migration (the default)
 *   bun run migrate up        run the next pending migration only
 *   bun run migrate down      roll the most recent migration back
 *   bun run migrate status    list every migration and when it was applied
 *
 * Prints the target before it touches anything, because the same command
 * points at a throwaway file locally and at a real Neon branch in CI. A
 * Postgres target additionally requires `--allow-remote` (or
 * `MIGRATE_ALLOW_REMOTE=1`) for the mutating commands: `bun run migrate` is a
 * muscle-memory command, and the cost of it silently reaching production once
 * is higher than the cost of typing a flag every time.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { FileMigrationProvider, Migrator } from "kysely/migration";

import { createDb } from "@/lib/db";
import { getDatabaseDriver, getPostgresUrl, getSqliteFile } from "@/lib/db-url";

const MUTATING = new Set(["latest", "up", "down"]);

const describeTarget = (): string => {
  if (getDatabaseDriver() === "sqlite") return `sqlite · ${getSqliteFile()}`;
  const url = new URL(getPostgresUrl());
  return `postgres · ${url.host}${url.pathname}`;
};

const main = async (): Promise<void> => {
  const command = process.argv[2] ?? "latest";
  const allowRemote =
    process.argv.includes("--allow-remote") ||
    process.env.MIGRATE_ALLOW_REMOTE === "1";

  console.log(`target: ${describeTarget()}`);

  if (
    MUTATING.has(command) &&
    getDatabaseDriver() === "postgres" &&
    !allowRemote
  ) {
    console.error(
      `refusing to run "${command}" against a Postgres target without --allow-remote (or MIGRATE_ALLOW_REMOTE=1).`,
    );
    process.exit(1);
  }

  // SQLite will not create a missing directory for its file.
  if (getDatabaseDriver() === "sqlite") {
    await fs.mkdir(path.dirname(path.resolve(getSqliteFile())), {
      recursive: true,
    });
  }

  const db = createDb();
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(import.meta.dirname, "migrations"),
    }),
  });

  if (command === "status") {
    const rows = await migrator.getMigrations();
    for (const m of rows) {
      const when = m.executedAt
        ? new Date(m.executedAt).toISOString()
        : "pending";
      console.log(`  ${m.name.padEnd(28)} ${when}`);
    }
    await db.destroy();
    return;
  }

  const run = {
    latest: () => migrator.migrateToLatest(),
    up: () => migrator.migrateUp(),
    down: () => migrator.migrateDown(),
  }[command];

  if (!run) {
    console.error(
      `unknown command "${command}" — expected latest | up | down | status.`,
    );
    process.exit(1);
  }

  const { error, results } = await run();

  for (const r of results ?? []) {
    console.log(
      r.status === "Success"
        ? `  ✓ ${r.migrationName} (${r.direction})`
        : `  ✗ ${r.migrationName} (${r.direction}) — ${r.status}`,
    );
  }

  await db.destroy();

  if (error) {
    console.error("migration failed:", error);
    process.exit(1);
  }
  if ((results ?? []).length === 0) console.log("  (nothing to do)");
};

await main();

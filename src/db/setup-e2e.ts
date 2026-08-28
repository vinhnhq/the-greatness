/**
 * Prepares the E2E database before Playwright starts the app.
 *
 * A **separate file** from the development one (`DATABASE_FILE=.data/e2e.db`,
 * set in `playwright.config.ts`), rebuilt from empty on every run. That
 * separation is the point: the suite creates, renames and deletes products
 * freely, and doing that to the database someone was clicking around in is
 * how a demo ends up empty five minutes before it is given.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { FileMigrationProvider, Migrator } from "kysely/migration";

import { createDb } from "@/lib/db";
import { getSqliteFile } from "@/lib/db-url";

import { placeholderPng } from "./seed-media";

export const E2E_OPERATOR_EMAIL = "e2e@the-greatness.local";

const main = async (): Promise<void> => {
  const file = path.resolve(getSqliteFile());
  await fs.rm(file, { force: true });
  // SQLite's WAL and shared-memory sidecars survive deleting the database
  // itself, and a stale pair against a fresh file is a locked database.
  await fs.rm(`${file}-wal`, { force: true });
  await fs.rm(`${file}-shm`, { force: true });
  await fs.mkdir(path.dirname(file), { recursive: true });

  const db = createDb();
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(import.meta.dirname, "migrations"),
    }),
  });

  const { error } = await migrator.migrateToLatest();
  if (error) {
    console.error("e2e migrations failed:", error);
    process.exit(1);
  }

  // One operator for the dev-login picker to offer, and one category so the
  // product form has something to tick. No products: the suite creates its
  // own, and pre-seeded rows would make "the list shows my product" pass for
  // the wrong reason.
  const now = new Date();
  await db
    .insertInto("users")
    .values({
      id: "01900000-0000-7000-8000-000000000001",
      email: E2E_OPERATOR_EMAIL,
      emailVerified: 1,
      name: "E2E Operator",
      image: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();
  await db
    .insertInto("categories")
    .values({
      id: "01900000-0000-7000-8000-000000000002",
      name: "Bags",
      slug: "bags",
      parentId: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  await db.destroy();

  // An oversized photograph, generated rather than committed: 2.4 MB of
  // binary in git history to prove one resize is a bad trade, and the encoder
  // that writes it is the seed's, already exercised on every `db:local`.
  //
  // 5000×3000 clears the 4096px archive cap, so the E2E suite can prove the
  // browser's real canvas path resizes it — every unit test around that path
  // mocks the canvas, so this is the only place it actually runs.
  const fixtures = path.resolve("e2e/fixtures");
  await fs.mkdir(fixtures, { recursive: true });
  await fs.writeFile(
    path.join(fixtures, "large-photo.png"),
    placeholderPng("large", 5000, 3000),
  );

  console.log(`e2e database ready: ${getSqliteFile()}`);
};

await main();

/**
 * D.5 — the migrations apply, roll back and re-apply cleanly.
 *
 * Roll-forward alone is not the test worth having: `down` is what a bad
 * deploy runs, and a `down` that half-works leaves a database in a state no
 * later migration can reason about. Running up → down → up in one file is the
 * cheapest way to keep both directions honest.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { Kysely, sql } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { DB } from "@/lib/db-types";
import { SqliteDialect } from "@/lib/db/sqlite-dialect";

let db: Kysely<DB>;
let migrator: Migrator;

const tableNames = async (): Promise<readonly string[]> => {
  const { rows } = await sql<{ name: string }>`
    select name from sqlite_master where type = 'table' order by name
  `.execute(db);
  return rows
    .map((r) => r.name)
    .filter((n) => !n.startsWith("sqlite_") && !n.startsWith("kysely_"));
};

beforeEach(() => {
  db = new Kysely<DB>({ dialect: new SqliteDialect({ filename: ":memory:" }) });
  migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve("src/db/migrations"),
    }),
  });
});

afterEach(async () => {
  await db.destroy();
});

describe("migrations", () => {
  it("migrates to latest and creates every table db-types declares", async () => {
    const { error, results } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();
    expect(results?.every((r) => r.status === "Success")).toBe(true);

    expect(await tableNames()).toEqual([
      "accounts",
      "categories",
      "product_attachments",
      "product_categories",
      "products",
      "sessions",
      "users",
      "verifications",
    ]);
  });

  it("rolls every migration back down to an empty schema, then re-applies", async () => {
    await migrator.migrateToLatest();

    let step = await migrator.migrateDown();
    while ((step.results ?? []).length > 0) {
      expect(step.error).toBeUndefined();
      step = await migrator.migrateDown();
    }
    expect(await tableNames()).toEqual([]);

    const again = await migrator.migrateToLatest();
    expect(again.error).toBeUndefined();
    expect(await tableNames()).toHaveLength(8);
  });

  it("enforces the unique constraints the save path relies on", async () => {
    await migrator.migrateToLatest();

    const insert = (id: string, slug: string, sku: string | null) =>
      db
        .insertInto("products")
        .values({
          id,
          name: "Anvil",
          slug,
          sku,
          description: null,
          priceMinor: 1000,
          currency: "VND",
          status: "draft",
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();

    await insert("p1", "anvil", "SKU-1");
    await expect(insert("p2", "anvil", "SKU-2")).rejects.toThrow();
    await expect(insert("p3", "anvil-2", "SKU-1")).rejects.toThrow();

    // A null sku must stay repeatable — sku is optional, and a UNIQUE index
    // that collapsed nulls would let the first blank sku block every later one.
    await insert("p4", "anvil-4", null);
    await insert("p5", "anvil-5", null);
    const rows = await db.selectFrom("products").select("id").execute();
    expect(rows).toHaveLength(3);
  });

  it("refuses a duplicate category link (composite primary key)", async () => {
    await migrator.migrateToLatest();
    const link = () =>
      db
        .insertInto("product_categories")
        .values({ productId: "p1", categoryId: "c1" })
        .execute();
    await link();
    await expect(link()).rejects.toThrow();
  });
});

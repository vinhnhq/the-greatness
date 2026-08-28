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
      "media_assets",
      "product_categories",
      "product_media",
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
    expect(await tableNames()).toHaveLength(9);
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
          searchText: "anvil",
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

describe("migration 004 — the media backfill", () => {
  /** The pre-004 world: run every migration, then undo just this one. */
  const atMigration003 = async () => {
    await migrator.migrateToLatest();
    await migrator.migrateDown();
  };

  const legacyAttachment = (id: string, productId: string, position: number) =>
    db
      .insertInto("product_attachments" as never)
      .values({
        id,
        productId,
        kind: "image",
        originUrl: `/uploads/products/${productId}/${id}/origin.png`,
        optimizedUrl: `/uploads/products/${productId}/${id}/optimized.png`,
        posterUrl: null,
        mime: "image/png",
        bytes: 900_000,
        optimizedBytes: 50_000,
        width: 900,
        height: 900,
        durationMs: null,
        position,
        alt: `alt-${id}`,
        createdAt: new Date("2026-08-01"),
      } as never)
      .execute();

  it("carries every existing attachment into the library, keeping its id", async () => {
    // The point of the backfill: a migration that needs `db:reset` is a reset
    // with extra steps, and it would throw away every image already uploaded.
    // Ids are preserved so the paths already on disk keep resolving.
    await atMigration003();
    await legacyAttachment("att-1", "prod-1", 0);
    await legacyAttachment("att-2", "prod-1", 1);
    await legacyAttachment("att-3", "prod-2", 0);

    const { error } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();

    const assets = await db
      .selectFrom("media_assets")
      .selectAll()
      .orderBy("id", "asc")
      .execute();
    expect(assets.map((a) => a.id)).toEqual(["att-1", "att-2", "att-3"]);
    // Alt moved onto the asset, and the stored URL is untouched.
    expect(assets[0].alt).toBe("alt-att-1");
    expect(assets[0].originUrl).toBe(
      "/uploads/products/prod-1/att-1/origin.png",
    );

    const links = await db
      .selectFrom("product_media")
      .selectAll()
      .orderBy("productId", "asc")
      .orderBy("position", "asc")
      .execute();
    expect(links.map((l) => [l.productId, l.mediaId, l.position])).toEqual([
      ["prod-1", "att-1", 0],
      ["prod-1", "att-2", 1],
      ["prod-2", "att-3", 0],
    ]);
  });

  it("leaves no trace of the old table", async () => {
    await atMigration003();
    await legacyAttachment("att-1", "prod-1", 0);
    await migrator.migrateToLatest();

    expect(await tableNames()).not.toContain("product_attachments");
  });

  it("migrates an empty database without complaint", async () => {
    // The common case on a fresh clone, and the one where a backfill written
    // as an INSERT…SELECT over no rows can still fail on a typo.
    await atMigration003();
    const { error } = await migrator.migrateToLatest();
    expect(error).toBeUndefined();
    expect(await db.selectFrom("media_assets").selectAll().execute()).toEqual(
      [],
    );
  });

  it("rolls back lossily but coherently", async () => {
    // Down is lossy and cannot not be: the old schema has nowhere to put a
    // file that belongs to nobody. What it must not do is produce a row that
    // breaks the old shape's primary key.
    await migrator.migrateToLatest();
    const now = new Date("2026-08-01");
    await db
      .insertInto("media_assets")
      .values([
        {
          id: "m-shared",
          kind: "image",
          originUrl: "/uploads/media/m-shared/origin.png",
          optimizedUrl: null,
          posterUrl: null,
          mime: "image/png",
          bytes: 1,
          optimizedBytes: null,
          width: null,
          height: null,
          durationMs: null,
          alt: null,
          createdAt: now,
        },
        {
          id: "m-orphan",
          kind: "image",
          originUrl: "/uploads/media/m-orphan/origin.png",
          optimizedUrl: null,
          posterUrl: null,
          mime: "image/png",
          bytes: 1,
          optimizedBytes: null,
          width: null,
          height: null,
          durationMs: null,
          alt: null,
          createdAt: now,
        },
      ])
      .execute();
    await db
      .insertInto("product_media")
      .values([
        { productId: "p-a", mediaId: "m-shared", position: 0 },
        { productId: "p-b", mediaId: "m-shared", position: 0 },
      ])
      .execute();

    const { error } = await migrator.migrateDown();
    expect(error).toBeUndefined();

    const rows = await db
      .selectFrom("product_attachments" as never)
      .selectAll()
      .execute();
    // One row for the shared asset (the second link cannot fit; its id is
    // already taken) and none for the orphan (no product to hang it on).
    expect(rows).toHaveLength(1);
  });
});

/**
 * The sync against a real database — where the invariants either hold or the
 * catalogue quietly loses work.
 *
 * `planSync` is unit-tested and proves the *decision*. This file proves what
 * actually reaches the tables, which is a different claim: that a category
 * keeps its parent, that a product keeps its media, and that nothing is ever
 * deleted for having gone from Sapo. Every one of those is a way a scheduled
 * job silently destroys a person's afternoon, and none of them is visible
 * from a plan object.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SapoSnapshot } from "@/db/sync-sapo";
import { syncFromSapo } from "@/db/sync-sapo";
import type { DB } from "@/lib/db-types";
import { SqliteDialect } from "@/lib/db/sqlite-dialect";

let db: Kysely<DB>;

const NOW = new Date("2026-09-01T00:00:00Z");

const snapshot = (patch: Partial<SapoSnapshot> = {}): SapoSnapshot => ({
  categories: [
    { sourceId: 1, name: "Thiết bị gia đình", slug: "tbgd" },
    { sourceId: 2, name: "Quạt", slug: "quat" },
  ],
  products: [
    {
      sourceId: 10,
      name: "Quạt đứng",
      slug: "quat-dung",
      sku: "Q1",
      descriptionHtml: "<p>Mát</p>",
      priceMinor: 500000,
      variants: [],
    },
  ],
  links: [{ categorySourceId: 2, productSourceId: 10 }],
  ...patch,
});

/** The state after a seed: the tree already built, media already attached. */
const seedLocal = async (): Promise<void> => {
  await db
    .insertInto("categories")
    .values([
      {
        id: "c1",
        name: "Thiết bị gia đình",
        slug: "tbgd",
        parentId: null,
        sapoId: "1",
        createdAt: NOW,
        updatedAt: NOW,
      },
      // The tree: this one is a child, which is the thing Sapo cannot express.
      {
        id: "c2",
        name: "Quạt",
        slug: "quat",
        parentId: "c1",
        sapoId: "2",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ])
    .execute();
  await db
    .insertInto("products")
    .values({
      id: "p1",
      name: "Quạt đứng",
      slug: "quat-dung",
      sku: "Q1",
      description: "Mát",
      priceMinor: 500000,
      currency: "VND",
      status: "active",
      searchText: "quat dung q1 mat",
      sapoId: "10",
      createdAt: NOW,
      updatedAt: NOW,
    })
    .execute();
  await db
    .insertInto("product_categories")
    .values({ productId: "p1", categoryId: "c2" })
    .execute();
};

beforeEach(async () => {
  db = new Kysely<DB>({ dialect: new SqliteDialect({ filename: ":memory:" }) });
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve("src/db/migrations"),
    }),
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
  await seedLocal();
});

afterEach(async () => {
  await db.destroy();
});

const parentOf = async (id: string): Promise<string | null> =>
  (
    await db
      .selectFrom("categories")
      .select("parentId")
      .where("id", "=", id)
      .executeTakeFirstOrThrow()
  ).parentId;

describe("syncFromSapo", () => {
  it("changes nothing when the snapshot matches", async () => {
    const report = await syncFromSapo(db, snapshot());
    expect(report.categories).toMatchObject({
      added: 0,
      updated: 0,
      unchanged: 2,
    });
    expect(report.products).toMatchObject({
      added: 0,
      updated: 0,
      unchanged: 1,
    });
    expect(report.links).toEqual({ added: 0, removed: 0, keptLocal: 0 });
  });

  it("keeps the category tree — the invariant the whole design rests on", async () => {
    // Sapo has no parent field, so a sync that wrote parentId would flatten
    // the tree on a schedule with nothing in the report to say so.
    await syncFromSapo(db, snapshot());
    expect(await parentOf("c2")).toBe("c1");
  });

  it("keeps the tree even when the category itself changed upstream", async () => {
    await syncFromSapo(db, {
      ...snapshot(),
      categories: [
        { sourceId: 1, name: "Thiết bị gia đình", slug: "tbgd" },
        { sourceId: 2, name: "Quạt & làm mát", slug: "quat" },
      ],
    });
    const row = await db
      .selectFrom("categories")
      .selectAll()
      .where("id", "=", "c2")
      .executeTakeFirstOrThrow();
    expect(row.name).toBe("Quạt & làm mát");
    expect(row.parentId).toBe("c1");
  });

  it("brings a new category in unfiled rather than guessing a parent", async () => {
    const report = await syncFromSapo(db, {
      ...snapshot(),
      categories: [
        ...snapshot().categories,
        { sourceId: 3, name: "Quạt trần", slug: "quat-tran" },
      ],
    });
    expect(report.categories.added).toBe(1);
    expect(report.categories.unfiled).toEqual(["Quạt trần"]);
    const added = await db
      .selectFrom("categories")
      .selectAll()
      .where("sapoId", "=", "3")
      .executeTakeFirstOrThrow();
    // Creation order cannot place it, so it is not placed.
    expect(added.parentId).toBeNull();
  });

  it("reports a vanished category without deleting it", async () => {
    const report = await syncFromSapo(db, {
      ...snapshot(),
      categories: [{ sourceId: 1, name: "Thiết bị gia đình", slug: "tbgd" }],
      links: [],
    });
    expect(report.categories.vanished).toEqual(["Quạt"]);
    const still = await db
      .selectFrom("categories")
      .select("id")
      .where("id", "=", "c2")
      .executeTakeFirst();
    expect(still).toBeDefined();
  });

  it("reports a vanished product without deleting it or its media", async () => {
    await db
      .insertInto("media_assets")
      .values({
        id: "m1",
        kind: "image",
        originUrl: "/uploads/media/m1/origin.png",
        optimizedUrl: "/uploads/media/m1/display.webp",
        posterUrl: null,
        mime: "image/png",
        bytes: 10,
        optimizedBytes: 8,
        width: 10,
        height: 10,
        durationMs: null,
        alt: null,
        createdAt: NOW,
      })
      .execute();
    await db
      .insertInto("product_media")
      .values({ productId: "p1", mediaId: "m1", position: 1 })
      .execute();

    const report = await syncFromSapo(db, {
      ...snapshot(),
      products: [],
      links: [],
    });
    expect(report.products.vanished).toEqual(["Quạt đứng"]);

    const product = await db
      .selectFrom("products")
      .select("id")
      .where("id", "=", "p1")
      .executeTakeFirst();
    expect(product).toBeDefined();
    // A product pulled from the storefront for an afternoon must not take its
    // photographs with it.
    const media = await db
      .selectFrom("product_media")
      .select("mediaId")
      .where("productId", "=", "p1")
      .execute();
    expect(media).toHaveLength(1);
  });

  it("overwrites a product field Sapo owns", async () => {
    await syncFromSapo(db, {
      ...snapshot(),
      products: [
        {
          sourceId: 10,
          name: "Quạt đứng mới",
          slug: "quat-dung",
          sku: "Q1",
          descriptionHtml: "<p>Mát</p>",
          priceMinor: 600000,
          variants: [],
        },
      ],
    });
    const row = await db
      .selectFrom("products")
      .selectAll()
      .where("id", "=", "p1")
      .executeTakeFirstOrThrow();
    expect(row.name).toBe("Quạt đứng mới");
    expect(row.priceMinor).toBe(600000);
    // Derived, never fetched — and it must follow the name it was built from.
    expect(row.searchText).toContain("moi");
  });

  it("reconciles memberships Sapo owns", async () => {
    const report = await syncFromSapo(db, {
      ...snapshot(),
      links: [{ categorySourceId: 1, productSourceId: 10 }],
    });
    expect(report.links).toMatchObject({ added: 1, removed: 1 });
    const links = await db
      .selectFrom("product_categories")
      .select("categoryId")
      .execute();
    expect(links.map((l) => l.categoryId)).toEqual(["c1"]);
  });

  it("leaves a link to a locally-created category alone", async () => {
    // Categorisation done here is the point of the tree work; reconciling it
    // away on the next sync would undo an operator's whole afternoon.
    await db
      .insertInto("categories")
      .values({
        id: "local",
        name: "Ours",
        slug: "ours",
        parentId: null,
        sapoId: null,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .execute();
    await db
      .insertInto("product_categories")
      .values({ productId: "p1", categoryId: "local" })
      .execute();

    const report = await syncFromSapo(db, snapshot());
    expect(report.links.keptLocal).toBe(1);
    const kept = await db
      .selectFrom("product_categories")
      .select("categoryId")
      .where("categoryId", "=", "local")
      .execute();
    expect(kept).toHaveLength(1);
  });

  it("is idempotent — a second run changes nothing the first did not", async () => {
    const full = {
      ...snapshot(),
      categories: [
        ...snapshot().categories,
        { sourceId: 3, name: "Quạt trần", slug: "quat-tran" },
      ],
    };
    const first = await syncFromSapo(db, full);
    expect(first.categories.added).toBe(1);

    const second = await syncFromSapo(db, full);
    expect(second.categories).toMatchObject({ added: 0, updated: 0 });
    expect(second.links).toMatchObject({ added: 0, removed: 0 });
  });
});

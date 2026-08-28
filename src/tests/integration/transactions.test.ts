/**
 * `withTransaction` against a real database.
 *
 * The property under test is the one the save action depends on: a
 * repository written with **no transaction parameter** still writes inside
 * the transaction, because the connection is swapped ambiently in the child
 * context. If that ever stopped being true, saving a product would commit the
 * row and then fail to commit its attachments, and the result would look like
 * a successful save with the previous version's gallery.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getContext,
  readContext,
  type RequestContext,
  runWithContext,
  withTransaction,
} from "@/lib/context";
import type { DB } from "@/lib/db-types";
import { SqliteDialect } from "@/lib/db/sqlite-dialect";
import type { CategoryId } from "@/lib/domain/categories/entity";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import type { ProductId } from "@/lib/domain/products/entity";
import { dbProductRepo } from "@/lib/domain/products/repository";

let db: Kysely<DB>;
let ctx: RequestContext;

beforeEach(async () => {
  db = new Kysely<DB>({ dialect: new SqliteDialect({ filename: ":memory:" }) });
  ctx = { db, user: null, requestId: "tx-test" };
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
});

afterEach(async () => {
  await db.destroy();
});

const countProducts = async () => {
  const row = await db
    .selectFrom("products")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
};

const productInput = (name: string, slug: string) => ({
  name,
  slug,
  sku: null,
  description: null,
  priceMinor: 1_000,
  currency: "VND" as const,
  status: "draft" as const,
});

describe("withTransaction", () => {
  it("commits every write in the body together", async () => {
    await runWithContext(ctx, async () => {
      await withTransaction(async () => {
        const category = await dbCategoryRepo.create({
          name: "Bags",
          slug: "bags",
        });
        const product = await dbProductRepo.create(
          productInput("Tote", "tote"),
        );
        await dbProductRepo.setCategories(product.id, [category.id]);
      });
    });

    expect(await countProducts()).toBe(1);
    const links = await db
      .selectFrom("product_categories")
      .selectAll()
      .execute();
    expect(links).toHaveLength(1);
  });

  it("rolls every write back when the body throws", async () => {
    // The failure this prevents: a committed product row whose attachments
    // never landed, which renders as a successful save showing stale media.
    await runWithContext(ctx, async () => {
      await expect(
        withTransaction(async () => {
          await dbProductRepo.create(productInput("Doomed", "doomed"));
          await dbCategoryRepo.create({ name: "Ghost", slug: "ghost" });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    expect(await countProducts()).toBe(0);
    expect(await db.selectFrom("categories").selectAll().execute()).toEqual([]);
  });

  it("swaps the connection ambiently — repositories take no tx argument", async () => {
    // `dbProductRepo.create` reads its connection from context, so the proof
    // that it used the transaction's is that a rollback erased its work.
    let insideDb: unknown;
    const outsideDb = ctx.db;

    await runWithContext(ctx, async () => {
      await withTransaction(async () => {
        insideDb = (await readContext()).db;
      });
    });

    expect(insideDb).not.toBe(outsideDb);
  });

  it("restores the parent context after the transaction ends", async () => {
    await runWithContext(ctx, async () => {
      await withTransaction(async () => {
        await dbProductRepo.create(productInput("A", "a"));
      });
      // Back outside: the shared connection, and the same requestId.
      expect((await readContext()).db).toBe(ctx.db);
      expect(getContext().requestId).toBe("tx-test");
    });
  });

  it("keeps a failed transaction from poisoning later queries", async () => {
    // The driver serialises every query on one connection. A rejection that
    // broke the chain would take every subsequent query with it.
    await runWithContext(ctx, async () => {
      await expect(
        withTransaction(async () => {
          throw new Error("first");
        }),
      ).rejects.toThrow("first");

      const product = await dbProductRepo.create(
        productInput("After", "after"),
      );
      expect(product.name).toBe("After");
    });
  });

  it("throws when called outside a runWithContext frame", async () => {
    await expect(withTransaction(async () => 1)).rejects.toThrow(
      /outside runWithContext/,
    );
  });

  it("rolls back a partial save the way the save action would", async () => {
    // The concrete shape: product + links + attachments, with the last write
    // failing. Nothing may survive.
    const bogusAttachment = {
      kind: "image" as const,
      originUrl: "/uploads/a.png",
      optimizedUrl: null,
      posterUrl: null,
      mime: "image/png",
      bytes: 1,
      optimizedBytes: null,
      width: null,
      height: null,
      durationMs: null,
      alt: null,
    };

    await runWithContext(ctx, async () => {
      await expect(
        withTransaction(async () => {
          const product = await dbProductRepo.create(
            productInput("Half saved", "half-saved"),
          );
          await dbProductRepo.setCategories(product.id, [
            "cat-1" as CategoryId,
          ]);
          await dbProductRepo.setAttachments(product.id, [bogusAttachment]);
          // Whatever fails after the writes — a validation slip, a lost
          // connection — must take all three with it.
          throw new Error("late failure");
        }),
      ).rejects.toThrow("late failure");
    });

    expect(await countProducts()).toBe(0);
    expect(
      await db.selectFrom("product_attachments").selectAll().execute(),
    ).toEqual([]);
    expect(
      await db.selectFrom("product_categories").selectAll().execute(),
    ).toEqual([]);
  });

  it("leaves nothing behind when the product being updated has vanished", async () => {
    await runWithContext(ctx, async () => {
      const result = await dbProductRepo.update(
        "gone" as ProductId,
        productInput("X", "x"),
      );
      expect(result).toBeNull();
    });
  });
});

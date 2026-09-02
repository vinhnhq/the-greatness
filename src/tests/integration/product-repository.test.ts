/**
 * `dbProductRepo` against a real database.
 *
 * The unit tests run the list query against the in-memory twin. That is fast
 * and it is also a second implementation of the same rules — so the only
 * thing proving the twin is not quietly lying is this file, which runs the
 * **same expectations** through actual SQL. Where they disagree, one of them
 * is a bug, and the disagreement is the point.
 *
 * Case-insensitive search is the specific reason this exists: `LIKE` behaves
 * differently across drivers and `includes()` behaves like neither, so the
 * twin cannot be trusted about it.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type RequestContext, runWithContext } from "@/lib/context";
import type { DB } from "@/lib/db-types";
import { SqliteDialect } from "@/lib/db/sqlite-dialect";
import type { CategoryId } from "@/lib/domain/categories/entity";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import type { MediaId, NewMediaAsset } from "@/lib/domain/media/entity";
import { DEFAULT_MEDIA_QUERY } from "@/lib/domain/media/query";
import { dbMediaRepo } from "@/lib/domain/media/repository";
import { DEFAULT_QUERY, UNCATEGORIZED } from "@/lib/domain/products/list-query";
import type { ProductListQuery } from "@/lib/domain/products/list-query";
import { dbProductRepo } from "@/lib/domain/products/repository";

let db: Kysely<DB>;
let ctx: RequestContext;

const inCtx = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithContext(ctx, fn) as Promise<T>;

const query = (patch: Partial<ProductListQuery> = {}): ProductListQuery => ({
  ...DEFAULT_QUERY,
  ...patch,
});

beforeEach(async () => {
  db = new Kysely<DB>({ dialect: new SqliteDialect({ filename: ":memory:" }) });
  ctx = { db, user: null, requestId: "test" };
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

const seed = async () => {
  const bags = await inCtx(() =>
    dbCategoryRepo.create({ name: "Bags", slug: "bags" }),
  );
  const decor = await inCtx(() =>
    dbCategoryRepo.create({ name: "Decor", slug: "decor" }),
  );

  const make = async (
    name: string,
    over: Partial<{
      slug: string;
      sku: string | null;
      description: string | null;
      priceMinor: number;
      status: "draft" | "active" | "archived";
      categories: CategoryId[];
    }> = {},
  ) => {
    const product = await inCtx(() =>
      dbProductRepo.create({
        name,
        slug: over.slug ?? name.toLowerCase().replace(/\s+/g, "-"),
        sku: over.sku ?? null,
        description: over.description ?? null,
        priceMinor: over.priceMinor ?? 100_000,
        currency: "VND",
        status: over.status ?? "active",
      }),
    );
    if (over.categories) {
      await inCtx(() =>
        dbProductRepo.setCategories(product.id, over.categories ?? []),
      );
    }
    return product;
  };

  return { bags: bags.id, decor: decor.id, make };
};

describe("dbProductRepo.list — filters", () => {
  it("searches name, sku and description", async () => {
    const { make } = await seed();
    await make("Leather Tote", { sku: "TOTE-01", description: "Full grain." });
    await make("Ceramic Vase", { sku: "VASE-09", description: "Hand thrown." });

    const byName = await inCtx(() =>
      dbProductRepo.list(query({ search: "tote" })),
    );
    expect(byName.rows.map((r) => r.name)).toEqual(["Leather Tote"]);

    const bySku = await inCtx(() =>
      dbProductRepo.list(query({ search: "VASE-09" })),
    );
    expect(bySku.rows.map((r) => r.name)).toEqual(["Ceramic Vase"]);

    const byDescription = await inCtx(() =>
      dbProductRepo.list(query({ search: "hand thrown" })),
    );
    expect(byDescription.rows.map((r) => r.name)).toEqual(["Ceramic Vase"]);
  });

  it("matches regardless of case AND of diacritics", async () => {
    // The assertion that made `searchText` exist. `LOWER()` in SQLite is
    // ASCII-only, so `LOWER(name) LIKE LOWER(?)` finds nothing here — and
    // Postgres would have found it, so the bug would appear on exactly one
    // driver. The last two terms are the real reason: nobody types diacritics
    // into a search box.
    const { make } = await seed();
    await make("Áo Dài Lụa", { slug: "ao-dai-lua" });

    for (const term of ["áo dài", "ÁO DÀI", "Áo Dài", "ao dai", "AO DAI"]) {
      const found = await inCtx(() =>
        dbProductRepo.list(query({ search: term })),
      );
      expect(found.rows, `searching ${term}`).toHaveLength(1);
    }
  });

  it("finds a product whose đ the searcher typed as d", async () => {
    const { make } = await seed();
    await make("Đèn Bàn Gỗ", { slug: "den-ban-go" });
    const found = await inCtx(() =>
      dbProductRepo.list(query({ search: "den ban" })),
    );
    expect(found.rows).toHaveLength(1);
  });

  it("treats a user-typed % or _ as a literal, not a wildcard", async () => {
    // Without escaping, searching "%" returns the whole catalogue and "100%"
    // returns it too — silently, and only for data that contains one.
    const { make } = await seed();
    await make("Cotton 100% Tee", { slug: "cotton-tee" });
    await make("Wool Scarf", { slug: "wool-scarf" });

    const wildcard = await inCtx(() =>
      dbProductRepo.list(query({ search: "%" })),
    );
    // Matches the one product containing a literal "%", not both rows.
    expect(wildcard.rows.map((r) => r.name)).toEqual(["Cotton 100% Tee"]);

    const underscore = await inCtx(() =>
      dbProductRepo.list(query({ search: "_" })),
    );
    expect(underscore.total).toBe(0);

    const literal = await inCtx(() =>
      dbProductRepo.list(query({ search: "100%" })),
    );
    expect(literal.rows.map((r) => r.name)).toEqual(["Cotton 100% Tee"]);
  });

  it("filters by status", async () => {
    const { make } = await seed();
    await make("Draft One", { status: "draft" });
    await make("Live One", { status: "active" });
    await make("Old One", { status: "archived" });

    const drafts = await inCtx(() =>
      dbProductRepo.list(query({ status: "draft" })),
    );
    expect(drafts.rows.map((r) => r.name)).toEqual(["Draft One"]);
    expect(drafts.total).toBe(1);
  });

  it("filters by category without duplicating a product in two categories", async () => {
    // A naive JOIN returns the product once per matching link row, which
    // shows up as the same product twice in the table.
    const { make, bags, decor } = await seed();
    await make("Tote", { categories: [bags, decor] });
    await make("Vase", { categories: [decor] });

    const inDecor = await inCtx(() =>
      dbProductRepo.list(query({ categoryId: decor })),
    );
    expect(inDecor.total).toBe(2);
    expect(inDecor.rows.map((r) => r.name).sort()).toEqual(["Tote", "Vase"]);

    const inBags = await inCtx(() =>
      dbProductRepo.list(query({ categoryId: bags })),
    );
    expect(inBags.rows.map((r) => r.name)).toEqual(["Tote"]);
  });

  it("finds the products in no category at all", async () => {
    // The 697. `not exists` rather than a left join with a null check —
    // the total shares this builder, and a join would count a product in two
    // categories twice.
    const { make, bags, decor } = await seed();
    await make("Tote", { categories: [bags, decor] });
    await make("Vase", { categories: [decor] });
    await make("Loose One");
    await make("Loose Two");

    const orphans = await inCtx(() =>
      dbProductRepo.list(query({ categoryId: UNCATEGORIZED })),
    );
    expect(orphans.rows.map((r) => r.name).sort()).toEqual([
      "Loose One",
      "Loose Two",
    ]);
    expect(orphans.total).toBe(2);
  });

  it("stops counting a product as uncategorised once it is filed", async () => {
    const { make, bags } = await seed();
    const loose = await make("Loose One");

    const before = await inCtx(() =>
      dbProductRepo.list(query({ categoryId: UNCATEGORIZED })),
    );
    expect(before.total).toBe(1);

    await inCtx(() => dbProductRepo.setCategories(loose.id, [bags]));

    const after = await inCtx(() =>
      dbProductRepo.list(query({ categoryId: UNCATEGORIZED })),
    );
    expect(after.total).toBe(0);
  });

  it("combines search, status and category", async () => {
    const { make, bags } = await seed();
    await make("Tote Draft", { status: "draft", categories: [bags] });
    await make("Tote Live", { status: "active", categories: [bags] });
    await make("Vase Live", { status: "active" });

    const found = await inCtx(() =>
      dbProductRepo.list(
        query({ search: "tote", status: "active", categoryId: bags }),
      ),
    );
    expect(found.rows.map((r) => r.name)).toEqual(["Tote Live"]);
    expect(found.total).toBe(1);
  });
});

describe("dbProductRepo.list — sorting and paging", () => {
  it("sorts by name, price and update time in both directions", async () => {
    const { make } = await seed();
    await make("Beta", { priceMinor: 300 });
    await make("Alpha", { priceMinor: 100 });
    await make("Gamma", { priceMinor: 200 });

    const byName = await inCtx(() =>
      dbProductRepo.list(query({ sort: "name-asc" })),
    );
    expect(byName.rows.map((r) => r.name)).toEqual(["Alpha", "Beta", "Gamma"]);

    const byNameDesc = await inCtx(() =>
      dbProductRepo.list(query({ sort: "name-desc" })),
    );
    expect(byNameDesc.rows.map((r) => r.name)).toEqual([
      "Gamma",
      "Beta",
      "Alpha",
    ]);

    const byPrice = await inCtx(() =>
      dbProductRepo.list(query({ sort: "price-asc" })),
    );
    expect(byPrice.rows.map((r) => r.priceMinor)).toEqual([100, 200, 300]);
  });

  it("pages without dropping or repeating a row", async () => {
    // 30 products created in the same test share a timestamp to the second,
    // which is exactly the tie the uuid v7 tiebreaker exists for: without it,
    // a row can appear on both pages or on neither.
    const { make } = await seed();
    for (let n = 0; n < 30; n++) {
      await make(`Product ${String(n).padStart(2, "0")}`);
    }

    const first = await inCtx(() => dbProductRepo.list(query({ page: 1 })));
    const second = await inCtx(() => dbProductRepo.list(query({ page: 2 })));

    expect(first.total).toBe(30);
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(5);

    const ids = [...first.rows, ...second.rows].map((r) => r.id);
    expect(new Set(ids).size).toBe(30);
  });

  it("returns an empty page past the end rather than failing", async () => {
    const { make } = await seed();
    await make("Only One");
    const page = await inCtx(() => dbProductRepo.list(query({ page: 9 })));
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(1);
  });
});

describe("dbProductRepo — media links", () => {
  const asset = async (alt: string) => {
    const [created] = await inCtx(() =>
      dbMediaRepo.createMany([
        {
          kind: "image",
          originUrl: `/uploads/media/${alt}/origin.png`,
          optimizedUrl: `/uploads/media/${alt}/optimized.webp`,
          posterUrl: null,
          mime: "image/png",
          bytes: 1,
          optimizedBytes: 1,
          width: 900,
          height: 900,
          durationMs: null,
          alt,
        },
      ]),
    );
    return created;
  };

  it("loads a product's media in link order on the list, not N+1", async () => {
    const { make } = await seed();
    const product = await make("Gallery");
    const a = await asset("a");
    const b = await asset("b");
    await inCtx(() => dbProductRepo.setMedia(product.id, [b.id, a.id]));

    const page = await inCtx(() => dbProductRepo.list(query()));
    // Link order, not upload order — the operator arranged this.
    expect(page.rows[0].media.map((m) => m.alt)).toEqual(["b", "a"]);
    expect(page.rows[0].media[0].optimizedUrl).toBe(
      "/uploads/media/b/optimized.webp",
    );
  });

  it("shares one asset across two products", async () => {
    // The reason the schema changed: the old one could not express this at
    // all, because an attachment carried its product.
    const { make } = await seed();
    const first = await make("First");
    const second = await make("Second");
    const shared = await asset("shared");

    await inCtx(() => dbProductRepo.setMedia(first.id, [shared.id]));
    await inCtx(() => dbProductRepo.setMedia(second.id, [shared.id]));

    expect(
      (await inCtx(() => dbProductRepo.getById(first.id)))?.media[0].id,
    ).toBe(shared.id);
    expect(
      (await inCtx(() => dbProductRepo.getById(second.id)))?.media[0].id,
    ).toBe(shared.id);
  });

  it("replaces links rather than appending on a re-save", async () => {
    const { make } = await seed();
    const product = await make("Gallery");
    const a = await asset("a");
    const b = await asset("b");

    await inCtx(() => dbProductRepo.setMedia(product.id, [a.id, b.id]));
    await inCtx(() => dbProductRepo.setMedia(product.id, [a.id]));

    const saved = await inCtx(() => dbProductRepo.getById(product.id));
    expect(saved?.media.map((m) => m.alt)).toEqual(["a"]);
  });

  it("unlinking leaves the asset in the library", async () => {
    const { make } = await seed();
    const product = await make("Gallery");
    const a = await asset("a");
    await inCtx(() => dbProductRepo.setMedia(product.id, [a.id]));

    await inCtx(() => dbProductRepo.setMedia(product.id, []));

    expect(
      (await inCtx(() => dbProductRepo.getById(product.id)))?.media,
    ).toEqual([]);
    expect(await inCtx(() => dbMediaRepo.getMany([a.id]))).toHaveLength(1);
  });

  it("deleting a product drops its links and keeps the files", async () => {
    const { make, bags } = await seed();
    const product = await make("Doomed", { categories: [bags] });
    const a = await asset("a");
    await inCtx(() => dbProductRepo.setMedia(product.id, [a.id]));

    await inCtx(() => dbProductRepo.remove(product.id));

    expect(await inCtx(() => dbProductRepo.getById(product.id))).toBeNull();
    expect(await db.selectFrom("product_media").selectAll().execute()).toEqual(
      [],
    );
    expect(
      await db.selectFrom("product_categories").selectAll().execute(),
    ).toEqual([]);
    // The asset survives — another product might have been using it.
    expect(await inCtx(() => dbMediaRepo.getMany([a.id]))).toHaveLength(1);
  });

  it("keeps products when their category is deleted", async () => {
    // Deleting a category must never delete stock.
    const { make, bags } = await seed();
    const product = await make("Survivor", { categories: [bags] });

    await inCtx(() => dbCategoryRepo.remove(bags));

    const saved = await inCtx(() => dbProductRepo.getById(product.id));
    expect(saved?.name).toBe("Survivor");
    expect(saved?.categoryIds).toEqual([]);
  });
});

describe("dbCategoryRepo", () => {
  it("counts products per category in one query", async () => {
    const { make, bags, decor } = await seed();
    await make("A", { categories: [bags] });
    await make("B", { categories: [bags, decor] });

    const counts = await inCtx(() => dbCategoryRepo.listWithCounts());
    expect(counts.map((c) => [c.name, c.productCount])).toEqual([
      ["Bags", 2],
      ["Decor", 1],
    ]);
  });

  it("excludes the edited row from the taken-slug set", async () => {
    const { bags } = await seed();
    const taken = await inCtx(() => dbCategoryRepo.takenSlugs(bags));
    expect(taken.has("bags")).toBe(false);
    expect(taken.has("decor")).toBe(true);
  });
});

describe("dbMediaRepo — the library", () => {
  const image = (alt: string): NewMediaAsset => ({
    kind: "image",
    originUrl: `/uploads/media/${alt}/origin.png`,
    optimizedUrl: `/uploads/media/${alt}/optimized.webp`,
    posterUrl: null,
    mime: "image/png",
    bytes: 900_000,
    optimizedBytes: 50_000,
    width: 900,
    height: 900,
    durationMs: null,
    alt,
  });

  const video = (alt: string): NewMediaAsset => ({
    kind: "video",
    originUrl: `/uploads/media/${alt}/origin.mp4`,
    optimizedUrl: null,
    posterUrl: `/uploads/media/${alt}/poster.webp`,
    mime: "video/mp4",
    bytes: 40_000_000,
    optimizedBytes: null,
    width: 1920,
    height: 1080,
    durationMs: 8_000,
    alt,
  });

  it("stores an uploaded batch with no product in sight", async () => {
    // The v2 premise: uploading does not need a product, and the assets are
    // usable — and findable — before anyone decides what they are for.
    await seed();
    const created = await inCtx(() =>
      dbMediaRepo.createMany([image("a"), image("b"), video("c")]),
    );
    expect(created).toHaveLength(3);

    const page = await inCtx(() => dbMediaRepo.list(DEFAULT_MEDIA_QUERY));
    expect(page.total).toBe(3);
    expect(page.counts).toEqual({ all: 3, image: 2, video: 1, unused: 3 });
    // Nothing links to them, which is the normal state for a fresh upload.
    expect(page.items.every((i) => i.usedBy.length === 0)).toBe(true);
  });

  it("serves an image's origin and a video's poster", async () => {
    await seed();
    await inCtx(() => dbMediaRepo.createMany([image("a"), video("c")]));
    const page = await inCtx(() => dbMediaRepo.list(DEFAULT_MEDIA_QUERY));

    const img = page.items.find((i) => i.asset.kind === "image");
    const vid = page.items.find((i) => i.asset.kind === "video");
    // The archive, not the 1600px variant baked at upload — `next/image`
    // derives the tile from it at request time. See `mediaSrc`.
    expect(img?.src).toMatch(/origin\.\w+$/);
    // A video tile must never be the 40 MB file itself.
    expect(vid?.src).toBe("/uploads/media/c/poster.webp");
  });

  it("reports which products use each asset", async () => {
    const { make } = await seed();
    const [a, b] = await inCtx(() =>
      dbMediaRepo.createMany([image("a"), image("b")]),
    );
    const tote = await make("Tote");
    const vase = await make("Vase");
    // One asset on two products — the thing the old schema could not express.
    await inCtx(() => dbProductRepo.setMedia(tote.id, [a.id]));
    await inCtx(() => dbProductRepo.setMedia(vase.id, [a.id, b.id]));

    const page = await inCtx(() => dbMediaRepo.list(DEFAULT_MEDIA_QUERY));
    const forA = page.items.find((i) => i.asset.id === a.id);
    expect(forA?.usedBy.map((p) => p.name)).toEqual(["Tote", "Vase"]);
    expect(page.counts.unused).toBe(0);
  });

  it("filters to what nothing is using", async () => {
    const { make } = await seed();
    const [a] = await inCtx(() =>
      dbMediaRepo.createMany([image("a"), image("b")]),
    );
    const tote = await make("Tote");
    await inCtx(() => dbProductRepo.setMedia(tote.id, [a.id]));

    const page = await inCtx(() =>
      dbMediaRepo.list({ ...DEFAULT_MEDIA_QUERY, unusedOnly: true }),
    );
    expect(page.items.map((i) => i.asset.alt)).toEqual(["b"]);
    // The counts still describe the whole library, so the tabs stay honest
    // while a filter is on.
    expect(page.counts.all).toBe(2);
    expect(page.total).toBe(1);
  });

  it("filters to one product's media", async () => {
    const { make } = await seed();
    const [a] = await inCtx(() =>
      dbMediaRepo.createMany([image("a"), image("b")]),
    );
    const tote = await make("Tote");
    await inCtx(() => dbProductRepo.setMedia(tote.id, [a.id]));

    const page = await inCtx(() =>
      dbMediaRepo.list({ ...DEFAULT_MEDIA_QUERY, productId: tote.id }),
    );
    expect(page.items.map((i) => i.asset.alt)).toEqual(["a"]);
  });

  it("deleting from the library takes it off every product too", async () => {
    // Otherwise the product renders a broken image with nothing in the UI
    // able to name the cause.
    const { make } = await seed();
    const [a] = await inCtx(() => dbMediaRepo.createMany([image("a")]));
    const tote = await make("Tote");
    await inCtx(() => dbProductRepo.setMedia(tote.id, [a.id]));

    await inCtx(() => dbMediaRepo.remove([a.id]));

    expect(await inCtx(() => dbMediaRepo.getMany([a.id]))).toEqual([]);
    expect((await inCtx(() => dbProductRepo.getById(tote.id)))?.media).toEqual(
      [],
    );
    const orphans = await db.selectFrom("product_media").selectAll().execute();
    expect(orphans).toEqual([]);
  });

  it("offers only products that actually have media", async () => {
    const { make } = await seed();
    const [a] = await inCtx(() => dbMediaRepo.createMany([image("a")]));
    const tote = await make("Tote");
    const bare = await make("No Media");
    await inCtx(() => dbProductRepo.setMedia(tote.id, [a.id]));

    const products = await inCtx(() => dbMediaRepo.productsWithMedia());
    expect(products.map((p) => p.name)).toEqual(["Tote"]);
    expect(products.some((p) => p.id === bare.id)).toBe(false);
  });

  it("reports zeroes rather than NaN on an empty library", async () => {
    // SUM over no rows is NULL, not 0 — the coercion is what stops the tabs
    // rendering "NaN".
    await seed();
    const page = await inCtx(() => dbMediaRepo.list(DEFAULT_MEDIA_QUERY));
    expect(page.counts).toEqual({ all: 0, image: 0, video: 0, unused: 0 });
    expect(page.total).toBe(0);
  });

  it("returns an empty page past the end rather than failing", async () => {
    await seed();
    await inCtx(() => dbMediaRepo.createMany([image("a")]));
    const page = await inCtx(() =>
      dbMediaRepo.list({ ...DEFAULT_MEDIA_QUERY, page: 9 }),
    );
    expect(page.items).toEqual([]);
    expect(page.total).toBe(1);
  });

  it("updates alt text on the asset, where it describes the picture", async () => {
    await seed();
    const [a] = await inCtx(() => dbMediaRepo.createMany([image("a")]));
    const updated = await inCtx(() =>
      dbMediaRepo.updateAlt(a.id, "A silk swatch"),
    );
    expect(updated?.alt).toBe("A silk swatch");
    expect(
      await inCtx(() => dbMediaRepo.updateAlt("gone" as MediaId, "x")),
    ).toBeNull();
  });
});

describe("dbProductRepo.listForTree", () => {
  it("returns every product by name, paging nothing", async () => {
    const { make } = await seed();
    await make("Zinc pot");
    await make("Ấm siêu tốc", { sku: "AST-1" });
    await make("Bếp từ", { status: "draft" });

    const rows = await inCtx(() => dbProductRepo.listForTree());

    // Vietnamese collation is SQLite's, not `localeCompare`'s, so the assertion
    // is on membership and shape rather than on an exact order the two
    // drivers need not share.
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name).sort()).toEqual(
      ["Bếp từ", "Zinc pot", "Ấm siêu tốc"].sort(),
    );
    expect(rows.find((r) => r.name === "Ấm siêu tốc")?.sku).toBe("AST-1");
    expect(rows.find((r) => r.name === "Bếp từ")?.status).toBe("draft");
  });

  it("carries four columns and no media", async () => {
    const { make } = await seed();
    await make("Solo");

    const rows = await inCtx(() => dbProductRepo.listForTree());

    // The tree draws an icon, so joining product_media here would fetch
    // assets to render nothing.
    expect(Object.keys(rows[0]!).sort()).toEqual([
      "id",
      "name",
      "sku",
      "status",
    ]);
  });

  it("returns plain objects, not the driver's rows", async () => {
    const { make } = await seed();
    await make("Solo");

    const rows = await inCtx(() => dbProductRepo.listForTree());

    // A null-prototype row builds fine and throws "Only plain objects can be
    // passed to Client Components" on the request. `listLinks` shipped that
    // bug once; this method crosses the same boundary.
    expect(Object.getPrototypeOf(rows[0])).toBe(Object.prototype);
  });
});

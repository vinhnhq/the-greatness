/**
 * The in-memory repositories.
 *
 * These are the twins the operation tests run against, so a bug in one is a
 * bug that makes those tests lie. They are held to the same expectations the
 * SQL side is held to in `tests/integration/product-repository.test.ts` —
 * where the two disagree, one of them is wrong and the disagreement is what
 * surfaces it.
 */

import { describe, expect, it } from "vitest";

import type { Category, CategoryId } from "@/lib/domain/categories/entity";
import { createInMemoryCategoryRepo } from "@/lib/domain/categories/repository";
import type { MediaAsset, MediaId } from "@/lib/domain/media/entity";
import { createInMemoryMediaRepo } from "@/lib/domain/media/in-memory";
import type { Product, ProductId } from "@/lib/domain/products/entity";
import { DEFAULT_QUERY } from "@/lib/domain/products/list-query";
import type { ProductListQuery } from "@/lib/domain/products/list-query";
import { createInMemoryProductRepo } from "@/lib/domain/products/repository";

const query = (patch: Partial<ProductListQuery> = {}): ProductListQuery => ({
  ...DEFAULT_QUERY,
  ...patch,
});

const category = (id: string, name: string): Category => ({
  id: id as CategoryId,
  name,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  parentId: null,
  sapoId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const asset = (id: string): MediaAsset => ({
  id: id as MediaId,
  kind: "image",
  originUrl: `/uploads/media/${id}/origin.png`,
  optimizedUrl: null,
  posterUrl: null,
  mime: "image/png",
  bytes: 1,
  optimizedBytes: null,
  width: null,
  height: null,
  durationMs: null,
  alt: null,
  createdAt: new Date(0),
});

// `id` is separated out because `Partial<Product>` types it as the branded
// `ProductId`, and intersecting that with `{ id: string }` produces a type no
// literal satisfies.
const product = (
  over: Omit<Partial<Product>, "id"> & { readonly id: string },
): Product => ({
  name: "Product",
  slug: "product",
  sku: null,
  sapoId: null,
  description: null,
  priceMinor: 100,
  currency: "VND",
  status: "active",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...over,
  id: over.id as ProductId,
});

describe("createInMemoryCategoryRepo", () => {
  it("lists alphabetically regardless of insertion order", async () => {
    const repo = createInMemoryCategoryRepo();
    await repo.create({ name: "Zinc", slug: "zinc" });
    await repo.create({ name: "Amber", slug: "amber" });
    expect((await repo.list()).map((c) => c.name)).toEqual(["Amber", "Zinc"]);
  });

  it("creates, reads back, renames and removes", async () => {
    const repo = createInMemoryCategoryRepo();
    const created = await repo.create({ name: "Bags", slug: "bags" });

    expect(await repo.getById(created.id)).toEqual(created);

    const renamed = await repo.rename(created.id, "Totes", "totes");
    expect(renamed?.name).toBe("Totes");
    expect(renamed?.slug).toBe("totes");

    await repo.remove(created.id);
    expect(await repo.getById(created.id)).toBeNull();
  });

  it("returns null when renaming something that is gone", async () => {
    const repo = createInMemoryCategoryRepo();
    expect(await repo.rename("nope" as CategoryId, "X", "x")).toBeNull();
  });

  it("excludes the edited row from the taken-slug set", async () => {
    // Without this, saving a category without changing its name reports its
    // own slug as taken.
    const repo = createInMemoryCategoryRepo();
    const bags = await repo.create({ name: "Bags", slug: "bags" });
    await repo.create({ name: "Decor", slug: "decor" });

    const taken = await repo.takenSlugs(bags.id);
    expect(taken.has("bags")).toBe(false);
    expect(taken.has("decor")).toBe(true);
  });

  it("counts linked products", async () => {
    const repo = createInMemoryCategoryRepo();
    repo.seed([category("c1", "Bags"), category("c2", "Decor")]);
    repo.links.set("c1", new Set(["p1", "p2"]));

    const counts = await repo.listWithCounts();
    expect(counts.map((c) => [c.name, c.productCount])).toEqual([
      ["Bags", 2],
      ["Decor", 0],
    ]);
  });
});

describe("createInMemoryProductRepo — list", () => {
  const seeded = () => {
    const repo = createInMemoryProductRepo();
    repo.seed([
      {
        ...product({
          id: "p1",
          name: "Áo Dài Lụa",
          sku: "ADL-01",
          priceMinor: 300,
          status: "active",
        }),
        categoryIds: ["c1" as CategoryId],
      },
      {
        ...product({
          id: "p2",
          name: "Ceramic Vase",
          description: "Hand thrown.",
          priceMinor: 100,
          status: "draft",
        }),
        categoryIds: ["c2" as CategoryId],
      },
      {
        ...product({
          id: "p3",
          name: "Brass Lamp",
          priceMinor: 200,
          status: "archived",
        }),
      },
    ]);
    return repo;
  };

  it("folds diacritics and case the same way the SQL side does", async () => {
    // The twin used to `toLowerCase().includes()`, which finds "áo dài" and
    // misses "ao dai" — the exact disagreement with SQL that the integration
    // suite catches. Both now fold through `productSearchText`.
    const repo = seeded();
    for (const term of ["áo dài", "AO DAI", "ao dai", "Áo Dài"]) {
      const page = await repo.list(query({ search: term }));
      expect(
        page.rows.map((r) => r.id),
        term,
      ).toEqual(["p1"]);
    }
  });

  it("searches sku and description as well as name", async () => {
    const repo = seeded();
    expect(
      (await repo.list(query({ search: "ADL-01" }))).rows.map((r) => r.id),
    ).toEqual(["p1"]);
    expect(
      (await repo.list(query({ search: "hand thrown" }))).rows.map((r) => r.id),
    ).toEqual(["p2"]);
  });

  it("filters by status and by category", async () => {
    const repo = seeded();
    expect(
      (await repo.list(query({ status: "draft" }))).rows.map((r) => r.id),
    ).toEqual(["p2"]);
    expect(
      (await repo.list(query({ categoryId: "c1" as CategoryId }))).rows.map(
        (r) => r.id,
      ),
    ).toEqual(["p1"]);
  });

  it("sorts by name and by price in both directions", async () => {
    const repo = seeded();
    expect(
      (await repo.list(query({ sort: "name-asc" }))).rows.map((r) => r.name),
    ).toEqual(["Áo Dài Lụa", "Brass Lamp", "Ceramic Vase"]);
    expect(
      (await repo.list(query({ sort: "price-desc" }))).rows.map(
        (r) => r.priceMinor,
      ),
    ).toEqual([300, 200, 100]);
  });

  it("breaks ties by id, so paging cannot drop or repeat a row", async () => {
    // Every row here shares a timestamp — the case the uuid v7 tiebreaker
    // exists for, and the one that produces a row visible on neither page.
    const repo = createInMemoryProductRepo();
    repo.seed(
      Array.from({ length: 30 }, (_, n) =>
        product({ id: `p${String(n).padStart(2, "0")}` }),
      ),
    );

    const first = await repo.list(query({ page: 1 }));
    const second = await repo.list(query({ page: 2 }));

    expect(first.total).toBe(30);
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(5);
    expect(new Set([...first.rows, ...second.rows].map((r) => r.id)).size).toBe(
      30,
    );
  });

  it("returns an empty page past the end, with the true total", async () => {
    const repo = seeded();
    const page = await repo.list(query({ page: 9 }));
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(3);
  });
});

describe("createInMemoryProductRepo — writes", () => {
  it("creates, updates and removes", async () => {
    const repo = createInMemoryProductRepo(() => new Date(1_000));
    const created = await repo.create({
      name: "Tote",
      slug: "tote",
      sku: "T-1",
      description: null,
      priceMinor: 100,
      currency: "VND",
      status: "draft",
    });

    const updated = await repo.update(created.id, {
      name: "Tote",
      slug: "tote",
      sku: "T-1",
      description: null,
      priceMinor: 150,
      currency: "VND",
      status: "active",
    });
    expect(updated?.priceMinor).toBe(150);
    expect(updated?.status).toBe("active");

    await repo.remove(created.id);
    expect(await repo.getById(created.id)).toBeNull();
  });

  it("returns null when updating something that is gone", async () => {
    const repo = createInMemoryProductRepo();
    const result = await repo.update("nope" as ProductId, {
      name: "X",
      slug: "x",
      sku: null,
      description: null,
      priceMinor: 0,
      currency: "VND",
      status: "draft",
    });
    expect(result).toBeNull();
  });

  it("finds a product by slug", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1", slug: "leather-tote" })]);
    expect((await repo.getBySlug("leather-tote"))?.id).toBe("p1");
    expect(await repo.getBySlug("nope")).toBeNull();
  });

  it("reports a taken sku, excluding the product being edited", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1", sku: "T-1" })]);
    expect(await repo.skuTaken("T-1")).toBe(true);
    expect(await repo.skuTaken("T-1", "p1" as ProductId)).toBe(false);
    expect(await repo.skuTaken("T-2")).toBe(false);
  });

  it("de-duplicates category links", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1" })]);
    await repo.setCategories("p1" as ProductId, [
      "c1" as CategoryId,
      "c1" as CategoryId,
      "c2" as CategoryId,
    ]);
    expect((await repo.getById("p1" as ProductId))?.categoryIds).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("keeps media links in the submitted order", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1" })]);
    repo.seedLibrary([asset("m1"), asset("m2")]);

    await repo.setMedia("p1" as ProductId, ["m2" as MediaId, "m1" as MediaId]);
    const saved = await repo.getById("p1" as ProductId);
    expect(saved?.media.map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  it("de-duplicates and replaces links rather than appending", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1" })]);
    repo.seedLibrary([asset("m1")]);

    await repo.setMedia("p1" as ProductId, ["m1" as MediaId, "m1" as MediaId]);
    expect((await repo.getById("p1" as ProductId))?.media).toHaveLength(1);

    await repo.setMedia("p1" as ProductId, []);
    expect((await repo.getById("p1" as ProductId))?.media).toEqual([]);
  });

  it("drops a link whose asset is gone, the way an INNER JOIN would", async () => {
    // Deleting from the library removes the links too, so this cannot happen
    // in practice — degrading to "not shown" rather than crashing is what
    // makes that a safe assumption rather than a hope.
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1" })]);
    repo.seedLibrary([asset("m1")]);
    await repo.setMedia("p1" as ProductId, [
      "m1" as MediaId,
      "gone" as MediaId,
    ]);
    expect(
      (await repo.getById("p1" as ProductId))?.media.map((m) => m.id),
    ).toEqual(["m1"]);
  });

  it("deleting a product removes its links, not the library assets", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1" })]);
    repo.seedLibrary([asset("m1")]);
    await repo.setMedia("p1" as ProductId, ["m1" as MediaId]);

    await repo.remove("p1" as ProductId);

    // Re-creating a product and linking the same asset works, which it would
    // not if `remove` had emptied the library.
    repo.seed([product({ id: "p2" })]);
    await repo.setMedia("p2" as ProductId, ["m1" as MediaId]);
    expect((await repo.getById("p2" as ProductId))?.media).toHaveLength(1);
  });
});

describe("createInMemoryMediaRepo", () => {
  const seeded = () => {
    const repo = createInMemoryMediaRepo();
    repo.seed([
      { ...asset("m1"), createdAt: new Date("2026-08-03") },
      { ...asset("m2"), createdAt: new Date("2026-08-01") },
      {
        ...asset("m3"),
        kind: "video" as const,
        createdAt: new Date("2026-08-02"),
      },
    ]);
    repo.links.set("m1", [{ id: "p1" as ProductId, name: "Tote" }]);
    return repo;
  };

  /** A `NewMediaAsset` — the shape the client sends after uploading, with no
   * id and no timestamp: the repository mints both. */
  const newAsset = () => ({
    kind: "image" as const,
    originUrl: "/uploads/media/new/origin.png",
    optimizedUrl: null,
    posterUrl: null,
    mime: "image/png",
    bytes: 1,
    optimizedBytes: null,
    width: null,
    height: null,
    durationMs: null,
    alt: null,
  });

  const query = (over: Record<string, unknown> = {}) => ({
    kind: "all" as const,
    unusedOnly: false,
    productId: null,
    page: 1,
    ...over,
  });

  it("lists newest first", async () => {
    const page = await seeded().list(query());
    expect(page.items.map((i) => i.asset.id)).toEqual(["m1", "m3", "m2"]);
  });

  it("counts the whole library even while a filter is active", async () => {
    // The counts are what let a tab say how many are behind it, so they
    // describe the library rather than the filtered view.
    const page = await seeded().list(query({ kind: "video" }));
    expect(page.counts).toEqual({ all: 3, image: 2, video: 1, unused: 2 });
    expect(page.total).toBe(1);
  });

  it("filters to what nothing is using", async () => {
    const page = await seeded().list(query({ unusedOnly: true }));
    expect(page.items.map((i) => i.asset.id).sort()).toEqual(["m2", "m3"]);
  });

  it("carries who uses each asset", async () => {
    const page = await seeded().list(query());
    expect(
      page.items.find((i) => i.asset.id === "m1")?.usedBy.map((p) => p.name),
    ).toEqual(["Tote"]);
    expect(page.items.find((i) => i.asset.id === "m2")?.usedBy).toEqual([]);
  });

  it("removing an asset removes its links with it", async () => {
    const repo = seeded();
    await repo.remove(["m1" as MediaId]);
    expect(await repo.getMany(["m1" as MediaId])).toEqual([]);
    expect(repo.links.has("m1")).toBe(false);
  });

  it("creates assets in the INPUT order, so a caller can match by position", async () => {
    // A batch upload matches each result to the file it came from by index.
    // Sorting here would be convenient for the gallery and wrong for the
    // caller — which is the same contract the SQL side keeps.
    const repo = createInMemoryMediaRepo();
    const created = await repo.createMany([
      { ...newAsset(), alt: "first" },
      { ...newAsset(), alt: "second" },
      { ...newAsset(), alt: "third" },
    ]);
    expect(created.map((a) => a.alt)).toEqual(["first", "second", "third"]);
    // And they are in the library afterwards.
    expect(
      (await repo.list(query())).items.map((i) => i.asset.alt).sort(),
    ).toEqual(["first", "second", "third"]);
  });

  it("mints a distinct id per asset", async () => {
    const repo = createInMemoryMediaRepo();
    const created = await repo.createMany([newAsset(), newAsset()]);
    expect(new Set(created.map((a) => a.id)).size).toBe(2);
  });

  it("returns nothing for an empty batch rather than inserting a blank", async () => {
    const repo = createInMemoryMediaRepo();
    expect(await repo.createMany([])).toEqual([]);
    expect(await repo.getMany([])).toEqual([]);
  });

  it("updates alt text, and reports a missing asset as null", async () => {
    const repo = seeded();
    const updated = await repo.updateAlt("m1" as MediaId, "A silk swatch");
    expect(updated?.alt).toBe("A silk swatch");
    expect((await repo.getMany(["m1" as MediaId]))[0].alt).toBe(
      "A silk swatch",
    );
    expect(await repo.updateAlt("gone" as MediaId, "x")).toBeNull();
  });

  it("lists the products that have media, alphabetically and once each", async () => {
    const repo = seeded();
    repo.links.set("m2", [
      { id: "p2" as ProductId, name: "Anvil" },
      { id: "p1" as ProductId, name: "Tote" },
    ]);
    // "Tote" is on two assets; it must appear once.
    expect((await repo.productsWithMedia()).map((p) => p.name)).toEqual([
      "Anvil",
      "Tote",
    ]);
  });

  it("returns an empty page past the end, with the true total", async () => {
    const repo = seeded();
    const page = await repo.list(query({ page: 9 }));
    expect(page.items).toEqual([]);
    expect(page.total).toBe(3);
  });

  it("filters to one product's media", async () => {
    const repo = seeded();
    const page = await repo.list(query({ productId: "p1" as ProductId }));
    expect(page.items.map((i) => i.asset.id)).toEqual(["m1"]);
  });
});

describe("the twin's listForTree", () => {
  it("returns every product by name, with no media and no paging", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([
      product({ id: "p2", name: "Ấm siêu tốc" }),
      product({ id: "p1", name: "Bếp từ" }),
    ]);

    const rows = await repo.listForTree();

    // Sorted the way the SQL side sorts, and carrying only the four columns
    // a tree leaf needs.
    expect(rows.map((r) => r.name)).toEqual(["Ấm siêu tốc", "Bếp từ"]);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      "id",
      "name",
      "sku",
      "status",
    ]);
  });

  it("does not page — `list` does, this does not", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed(
      Array.from({ length: 30 }, (_, i) =>
        product({ id: `p${i}`, name: `Product ${i}` }),
      ),
    );

    expect(await repo.listForTree()).toHaveLength(30);
    // The default page is smaller, which is the whole reason this method
    // exists: the tree needs all 832 at once.
    expect((await repo.list(query())).rows.length).toBeLessThan(30);
  });
});

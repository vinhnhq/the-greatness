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
  createdAt: new Date(0),
  updatedAt: new Date(0),
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

  it("renumbers attachment positions from the submitted order", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1" })]);
    const one = (url: string) => ({
      kind: "image" as const,
      originUrl: url,
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

    await repo.setAttachments("p1" as ProductId, [
      one("/b.png"),
      one("/a.png"),
    ]);
    const saved = await repo.getById("p1" as ProductId);
    expect(saved?.attachments.map((a) => [a.originUrl, a.position])).toEqual([
      ["/b.png", 0],
      ["/a.png", 1],
    ]);
  });

  it("replaces attachments rather than appending", async () => {
    const repo = createInMemoryProductRepo();
    repo.seed([product({ id: "p1" })]);
    const one = {
      kind: "image" as const,
      originUrl: "/a.png",
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
    await repo.setAttachments("p1" as ProductId, [one, one]);
    await repo.setAttachments("p1" as ProductId, [one]);
    expect((await repo.getById("p1" as ProductId))?.attachments).toHaveLength(
      1,
    );
  });
});

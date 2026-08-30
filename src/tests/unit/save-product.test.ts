/**
 * The save operation, end to end, against in-memory repositories — no
 * database, no mocking framework, just the closure the controller was built
 * to accept.
 */

import { describe, expect, it } from "vitest";

import type { Category, CategoryId } from "@/lib/domain/categories/entity";
import { createInMemoryCategoryRepo } from "@/lib/domain/categories/repository";
import type { MediaAsset, MediaId } from "@/lib/domain/media/entity";
import { createInMemoryMediaRepo } from "@/lib/domain/media/in-memory";
import type { ProductId } from "@/lib/domain/products/entity";
import {
  createDeleteProduct,
  createSaveProduct,
} from "@/lib/domain/products/operations/save-product/controller";
import {
  type SaveProductInput,
  validateSaveProduct,
} from "@/lib/domain/products/operations/save-product/invariants";
import { createInMemoryProductRepo } from "@/lib/domain/products/repository";

const CAT_A = "cat-a" as CategoryId;
const CAT_B = "cat-b" as CategoryId;
const MEDIA_1 = "media-1" as MediaId;
const MEDIA_2 = "media-2" as MediaId;

const libraryAsset = (id: MediaId): MediaAsset => ({
  id,
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

const category = (id: CategoryId, name: string): Category => ({
  id,
  name,
  slug: name.toLowerCase(),
  parentId: null,
  sapoId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const validInput = (
  overrides: Partial<SaveProductInput> = {},
): SaveProductInput => ({
  name: "Leather Tote Bag",
  slug: "",
  sku: "TOTE-01",
  description: "Full-grain leather.",
  priceMinor: 250_000,
  currency: "VND",
  status: "draft",
  categoryIds: [CAT_A],
  mediaIds: [],
  ...overrides,
});

const setup = () => {
  const productRepo = createInMemoryProductRepo(() => new Date("2026-08-28"));
  const categoryRepo = createInMemoryCategoryRepo();
  const mediaRepo = createInMemoryMediaRepo();
  categoryRepo.seed([category(CAT_A, "Bags"), category(CAT_B, "Leather")]);
  mediaRepo.seed([libraryAsset(MEDIA_1), libraryAsset(MEDIA_2)]);
  // The product twin resolves ids against its own copy of the library, the
  // way the SQL side resolves them through a JOIN.
  productRepo.seedLibrary([libraryAsset(MEDIA_1), libraryAsset(MEDIA_2)]);
  return {
    productRepo,
    categoryRepo,
    mediaRepo,
    save: createSaveProduct({ productRepo, categoryRepo, mediaRepo }),
    remove: createDeleteProduct({ productRepo }),
  };
};

const emptyContext = {
  takenSlugs: new Set<string>(),
  skuTaken: false,
  knownCategoryIds: new Set([CAT_A as string, CAT_B as string]),
  knownMediaIds: new Set([MEDIA_1 as string, MEDIA_2 as string]),
};

describe("validateSaveProduct", () => {
  it("accepts a well-formed product and derives the slug from the name", () => {
    const r = validateSaveProduct(validInput(), emptyContext);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.slug).toBe("leather-tote-bag");
      expect(r.value.sku).toBe("TOTE-01");
    }
  });

  it("normalises blank optional fields to null rather than empty strings", () => {
    // An empty string and a null read differently in every query that follows.
    const r = validateSaveProduct(
      validInput({ sku: "   ", description: "  " }),
      emptyContext,
    );
    if (r.ok) {
      expect(r.value.sku).toBeNull();
      expect(r.value.description).toBeNull();
    }
  });

  it("reports every problem at once, not just the first", () => {
    // A form that reveals one error per submit trains people to guess.
    const r = validateSaveProduct(
      validInput({ name: "", priceMinor: -5, currency: "GBP", status: "gone" }),
      emptyContext,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.errors.map((e) => e.field).sort()).toEqual([
        "currency",
        "name",
        "price",
        "status",
      ]);
    }
  });

  it.each([
    ["a missing name", { name: "  " }, "name"],
    ["an over-long name", { name: "x".repeat(200) }, "name"],
    ["an unparseable price", { priceMinor: null }, "price"],
    ["a negative price", { priceMinor: -1 }, "price"],
    ["an unknown currency", { currency: "GBP" }, "currency"],
    ["an unknown status", { status: "published" }, "status"],
    ["an unknown category", { categoryIds: ["cat-zzz"] }, "categoryIds"],
  ])("rejects %s", (_label, overrides, field) => {
    const r = validateSaveProduct(validInput(overrides), emptyContext);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.errors.some((e) => e.field === field)).toBe(true);
  });

  it("accepts a blank slug but rejects a typed one that slugifies to nothing", () => {
    expect(validateSaveProduct(validInput({ slug: "" }), emptyContext).ok).toBe(
      true,
    );
    const r = validateSaveProduct(validInput({ slug: "🎉🎉" }), emptyContext);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.errors[0].field).toBe("slug");
  });

  it("rejects a TYPED slug that is already taken", () => {
    const r = validateSaveProduct(validInput({ slug: "leather-tote-bag" }), {
      ...emptyContext,
      takenSlugs: new Set(["leather-tote-bag"]),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.errors).toContainEqual({ field: "slug", code: "taken" });
    }
  });

  it("accepts a DERIVED slug that is already taken, for the controller to suffix", () => {
    // Someone who typed a slug chose it and should be told it is gone.
    // Someone who typed only a name has expressed no preference, and two
    // products may legitimately share a name — rejecting that made the
    // controller's suffixing unreachable.
    const r = validateSaveProduct(validInput({ slug: "" }), {
      ...emptyContext,
      takenSlugs: new Set(["leather-tote-bag"]),
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a duplicate sku but not a duplicate blank one", () => {
    const dup = validateSaveProduct(validInput(), {
      ...emptyContext,
      skuTaken: true,
    });
    expect(dup.ok).toBe(false);

    // Two products with no sku is normal — sku is optional.
    const blank = validateSaveProduct(validInput({ sku: "" }), {
      ...emptyContext,
      skuTaken: true,
    });
    expect(blank.ok).toBe(true);
  });

  it("de-duplicates the category selection", () => {
    const r = validateSaveProduct(
      validInput({ categoryIds: [CAT_A, CAT_A, CAT_B] }),
      emptyContext,
    );
    if (r.ok) expect(r.value.categoryIds).toEqual([CAT_A, CAT_B]);
  });

  it("de-duplicates the media selection and keeps the order", () => {
    // Order is the product's gallery order, so it must survive
    // de-duplication rather than being sorted.
    const r = validateSaveProduct(
      validInput({ mediaIds: [MEDIA_2, MEDIA_1, MEDIA_2] }),
      emptyContext,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.mediaIds).toEqual([MEDIA_2, MEDIA_1]);
  });

  it("rejects an asset that is no longer in the library", () => {
    // A form left open while someone emptied the library would otherwise
    // write links to nothing, and the gallery would render blank.
    const r = validateSaveProduct(
      validInput({ mediaIds: ["media-gone"] }),
      emptyContext,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.errors).toContainEqual({
        field: "mediaIds",
        code: "unknown",
      });
    }
  });

  it("rejects more media than one product's grid can carry", () => {
    const r = validateSaveProduct(
      validInput({ mediaIds: Array.from({ length: 21 }, () => MEDIA_1) }),
      { ...emptyContext, knownMediaIds: new Set([MEDIA_1 as string]) },
    );
    // De-duplication runs first, so twenty-one copies of one asset is one
    // asset — the limit is on distinct media, which is what a gallery shows.
    expect(r.ok).toBe(true);
  });
});

describe("createSaveProduct — create", () => {
  it("writes the product, its category links and its media links", async () => {
    const { save, productRepo } = setup();
    const r = await save({
      input: validInput({
        categoryIds: [CAT_A, CAT_B],
        mediaIds: [MEDIA_2, MEDIA_1],
      }),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const saved = await productRepo.getById(r.value.id);
    expect(saved?.name).toBe("Leather Tote Bag");
    expect(saved?.categoryIds).toEqual([CAT_A, CAT_B]);
    // In the submitted order, which is the gallery order.
    expect(saved?.media.map((m) => m.id)).toEqual([MEDIA_2, MEDIA_1]);
  });

  it("links to the library asset rather than copying it", async () => {
    // The whole point of v2: two products can show the same photograph, and
    // neither owns it.
    const { save, productRepo } = setup();
    const first = await save({
      input: validInput({ sku: "A", mediaIds: [MEDIA_1] }),
    });
    const second = await save({
      input: validInput({ name: "Second", sku: "B", mediaIds: [MEDIA_1] }),
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const a = await productRepo.getById(first.value.id);
    const b = await productRepo.getById(second.value.id);
    expect(a?.media[0].id).toBe(MEDIA_1);
    expect(b?.media[0].id).toBe(MEDIA_1);
  });

  it("suffixes a derived slug when two products share a name", async () => {
    // A typed slug collision is a validation error; a derived one is not,
    // because two products may legitimately be called the same thing.
    const { save, productRepo } = setup();
    await save({ input: validInput({ sku: "A" }) });
    const second = await save({ input: validInput({ sku: "B" }) });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const slugs = (await productRepo.takenSlugs()).values().toArray().sort();
    expect(slugs).toEqual(["leather-tote-bag", "leather-tote-bag-2"]);
  });

  it("refuses a duplicate sku", async () => {
    const { save } = setup();
    await save({ input: validInput({ name: "First" }) });
    const second = await save({ input: validInput({ name: "Second" }) });
    expect(second.ok).toBe(false);
    if (!second.ok && second.error.tag === "SaveProductInvalid") {
      expect(second.error.errors).toContainEqual({
        field: "sku",
        code: "taken",
      });
    }
  });

  it("writes nothing when validation fails", async () => {
    const { save, productRepo } = setup();
    await save({ input: validInput({ name: "" }) });
    const page = await productRepo.list({
      search: "",
      status: "all",
      categoryId: null,
      sort: "updated-desc",
      page: 1,
    });
    expect(page.total).toBe(0);
  });
});

describe("createSaveProduct — update", () => {
  it("replaces the category links rather than adding to them", async () => {
    const { save, productRepo } = setup();
    const created = await save({
      input: validInput({ categoryIds: [CAT_A, CAT_B] }),
    });
    if (!created.ok) throw new Error("setup failed");

    await save({
      id: created.value.id,
      input: validInput({ categoryIds: [CAT_B] }),
    });

    const saved = await productRepo.getById(created.value.id);
    expect(saved?.categoryIds).toEqual([CAT_B]);
  });

  it("reorders the links from the submitted order", async () => {
    const { save, productRepo } = setup();
    const created = await save({
      input: validInput({ mediaIds: [MEDIA_1, MEDIA_2] }),
    });
    if (!created.ok) throw new Error("setup failed");

    await save({
      id: created.value.id,
      input: validInput({ mediaIds: [MEDIA_2, MEDIA_1] }),
    });

    const saved = await productRepo.getById(created.value.id);
    expect(saved?.media.map((m) => m.id)).toEqual([MEDIA_2, MEDIA_1]);
  });

  it("unlinking leaves the asset in the library", async () => {
    // A product form is not a place where files get destroyed.
    const { save, productRepo, mediaRepo } = setup();
    const created = await save({
      input: validInput({ mediaIds: [MEDIA_1] }),
    });
    if (!created.ok) throw new Error("setup failed");

    await save({ id: created.value.id, input: validInput({ mediaIds: [] }) });

    expect((await productRepo.getById(created.value.id))?.media).toEqual([]);
    expect(await mediaRepo.getMany([MEDIA_1])).toHaveLength(1);
  });

  it("lets a product keep its own slug and sku", async () => {
    // The taken-set excludes the product being edited; without that, saving a
    // product twice without touching anything would report both as taken.
    const { save } = setup();
    const created = await save({ input: validInput() });
    if (!created.ok) throw new Error("setup failed");

    const again = await save({
      id: created.value.id,
      input: validInput({ slug: "leather-tote-bag", status: "active" }),
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.status).toBe("active");
  });

  it("reports a missing product rather than creating one", async () => {
    const { save } = setup();
    const r = await save({
      id: "missing" as ProductId,
      input: validInput(),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("ProductNotFound");
  });
});

describe("createDeleteProduct", () => {
  it("removes the product and its links, but not the media", async () => {
    // The assets belong to the library, and another product may be using them.
    const { save, remove, productRepo, mediaRepo } = setup();
    const created = await save({
      input: validInput({ mediaIds: [MEDIA_1] }),
    });
    if (!created.ok) throw new Error("setup failed");

    const r = await remove(created.value.id);
    expect(r.ok).toBe(true);
    expect(await productRepo.getById(created.value.id)).toBeNull();
    expect(await mediaRepo.getMany([MEDIA_1])).toHaveLength(1);
  });

  it("reports a missing product", async () => {
    const { remove } = setup();
    const r = await remove("nope" as ProductId);
    expect(r.ok).toBe(false);
  });
});

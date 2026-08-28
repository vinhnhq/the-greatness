/**
 * The save operation, end to end, against in-memory repositories — no
 * database, no mocking framework, just the closure the controller was built
 * to accept.
 */

import { describe, expect, it } from "vitest";

import type { Category, CategoryId } from "@/lib/domain/categories/entity";
import { createInMemoryCategoryRepo } from "@/lib/domain/categories/repository";
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

const category = (id: CategoryId, name: string): Category => ({
  id,
  name,
  slug: name.toLowerCase(),
  parentId: null,
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
  attachments: [],
  ...overrides,
});

const setup = () => {
  const productRepo = createInMemoryProductRepo(() => new Date("2026-08-28"));
  const categoryRepo = createInMemoryCategoryRepo();
  categoryRepo.seed([category(CAT_A, "Bags"), category(CAT_B, "Leather")]);
  return {
    productRepo,
    categoryRepo,
    save: createSaveProduct({ productRepo, categoryRepo }),
    remove: createDeleteProduct({ productRepo }),
  };
};

const emptyContext = {
  takenSlugs: new Set<string>(),
  skuTaken: false,
  knownCategoryIds: new Set([CAT_A as string, CAT_B as string]),
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

  it("rejects an attachment with no origin url", () => {
    // The origin is the only file that cannot be regenerated; a row without
    // it renders nothing and can never be repaired.
    const r = validateSaveProduct(
      validInput({
        attachments: [
          {
            kind: "image",
            originUrl: "",
            optimizedUrl: "/uploads/x.webp",
            posterUrl: null,
            mime: "image/png",
            bytes: 1,
            optimizedBytes: 1,
            width: 1,
            height: 1,
            durationMs: null,
            alt: null,
          },
        ],
      }),
      emptyContext,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.errors).toContainEqual({
        field: "attachments",
        code: "missing-origin",
      });
    }
  });

  it("rejects more attachments than the grid can carry", () => {
    const one = {
      kind: "image" as const,
      originUrl: "/uploads/x.png",
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
    const r = validateSaveProduct(
      validInput({ attachments: Array.from({ length: 21 }, () => one) }),
      emptyContext,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.errors).toContainEqual({
        field: "attachments",
        code: "too-many",
      });
    }
  });
});

describe("createSaveProduct — create", () => {
  it("writes the product, its links and its attachments", async () => {
    const { save, productRepo } = setup();
    const r = await save({
      input: validInput({
        categoryIds: [CAT_A, CAT_B],
        attachments: [
          {
            kind: "image",
            originUrl: "/uploads/a-origin.jpg",
            optimizedUrl: "/uploads/a-optimized.webp",
            posterUrl: null,
            mime: "image/jpeg",
            bytes: 900_000,
            optimizedBytes: 50_000,
            width: 3000,
            height: 2000,
            durationMs: null,
            alt: "  ",
          },
        ],
      }),
    });

    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const saved = await productRepo.getById(r.value.id);
    expect(saved?.name).toBe("Leather Tote Bag");
    expect(saved?.categoryIds).toEqual([CAT_A, CAT_B]);
    expect(saved?.attachments).toHaveLength(1);
    // A whitespace-only alt is stored as null, not as "  ", so a screen
    // reader announces the fallback rather than a blank.
    expect(saved?.attachments[0].alt).toBeNull();
    expect(saved?.attachments[0].position).toBe(0);
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

  it("renumbers positions from the submitted order", async () => {
    const { save, productRepo } = setup();
    const attachment = (url: string) => ({
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

    const created = await save({
      input: validInput({
        attachments: [attachment("/a.png"), attachment("/b.png")],
      }),
    });
    if (!created.ok) throw new Error("setup failed");

    await save({
      id: created.value.id,
      input: validInput({
        attachments: [attachment("/b.png"), attachment("/a.png")],
      }),
    });

    const saved = await productRepo.getById(created.value.id);
    expect(saved?.attachments.map((a) => [a.originUrl, a.position])).toEqual([
      ["/b.png", 0],
      ["/a.png", 1],
    ]);
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
  it("removes the product and its relations", async () => {
    const { save, remove, productRepo } = setup();
    const created = await save({ input: validInput() });
    if (!created.ok) throw new Error("setup failed");

    const r = await remove(created.value.id);
    expect(r.ok).toBe(true);
    expect(await productRepo.getById(created.value.id)).toBeNull();
  });

  it("reports a missing product", async () => {
    const { remove } = setup();
    const r = await remove("nope" as ProductId);
    expect(r.ok).toBe(false);
  });
});

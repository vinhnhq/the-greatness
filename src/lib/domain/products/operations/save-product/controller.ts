/**
 * Save a product — create when no id is given, update otherwise.
 *
 * Dependencies arrive by closure (`createSaveProduct({ productRepo, ... })`)
 * rather than being imported, so a unit test drives the whole operation
 * against in-memory repositories and a fixed clock with no database and no
 * mocking framework.
 *
 * The controller does no validation of its own: that is `invariants.ts`,
 * which is pure and reports every field at once. What lives here is the
 * ordering — read what validation needs, validate, then write the product,
 * its category links and its attachments. The **caller** wraps this in
 * `withTransaction`, because whether those three writes commit together is a
 * property of the request, not of the operation.
 */

import type { Currency } from "@/lib/money";
import type { Result } from "@/lib/result";
import { err, ok } from "@/lib/result";
import { uniqueSlug } from "@/lib/slug";

import type { CategoryRepository } from "../../../categories/repository";
import type { MediaId } from "../../../media/entity";
import type { MediaRepository } from "../../../media/repository";
import type { Product, ProductId, ProductStatus } from "../../entity";
import type { ProductRepository } from "../../repository";
import {
  type SaveProductErrors,
  type SaveProductInput,
  validateSaveProduct,
} from "./invariants";

export type SaveProductDeps = {
  readonly productRepo: ProductRepository;
  readonly categoryRepo: CategoryRepository;
  readonly mediaRepo: MediaRepository;
};

export type SaveProductCommand = {
  /** Absent for a create. */
  readonly id?: ProductId;
  readonly input: SaveProductInput;
};

export type SaveProductFailure =
  | SaveProductErrors
  | { readonly tag: "ProductNotFound"; readonly id: ProductId };

export const createSaveProduct =
  ({ productRepo, categoryRepo, mediaRepo }: SaveProductDeps) =>
  async (
    command: SaveProductCommand,
  ): Promise<Result<SaveProductFailure, Product>> => {
    const { id, input } = command;

    if (id) {
      const existing = await productRepo.getById(id);
      if (!existing) return err({ tag: "ProductNotFound", id });
    }

    const [takenSlugs, categories, media] = await Promise.all([
      productRepo.takenSlugs(id),
      categoryRepo.list(),
      // Only the assets this save actually references — checking the whole
      // library would grow with it, and the question is just "do these exist".
      mediaRepo.getMany(input.mediaIds as MediaId[]),
    ]);
    const sku = input.sku.trim();
    const skuTaken = sku === "" ? false : await productRepo.skuTaken(sku, id);

    const validated = validateSaveProduct(input, {
      takenSlugs,
      skuTaken,
      knownCategoryIds: new Set(categories.map((c) => c.id as string)),
      knownMediaIds: new Set(media.map((m) => m.id as string)),
    });
    if (!validated.ok) return validated;

    const v = validated.value;
    // Validation rejects an explicitly-typed slug that is taken, so a
    // collision can only reach here from a *derived* one — two products named
    // the same thing. Suffixing beats making someone invent a different name
    // for a genuinely duplicate product name.
    const slug = takenSlugs.has(v.slug)
      ? uniqueSlug(v.name, takenSlugs)
      : v.slug;

    const fields = {
      name: v.name,
      slug,
      sku: v.sku,
      description: v.description,
      priceMinor: v.priceMinor,
      currency: v.currency as Currency,
      status: v.status as ProductStatus,
    };

    const product = id
      ? await productRepo.update(id, fields)
      : await productRepo.create(fields);

    // `update` returns null only if the row disappeared between the check
    // above and here — a concurrent delete, which is a real outcome rather
    // than an impossible one.
    if (!product) return err({ tag: "ProductNotFound", id: id as ProductId });

    await productRepo.setCategories(product.id, v.categoryIds);
    await productRepo.setMedia(product.id, v.mediaIds);

    return ok(product);
  };

export type DeleteProductDeps = {
  readonly productRepo: ProductRepository;
};

export const createDeleteProduct =
  ({ productRepo }: DeleteProductDeps) =>
  async (
    id: ProductId,
  ): Promise<Result<{ readonly tag: "ProductNotFound" }, ProductId>> => {
    const existing = await productRepo.getById(id);
    if (!existing) return err({ tag: "ProductNotFound" });
    // The media survives: it belongs to the library, and another product may
    // be using it. `remove` drops the links only.
    await productRepo.remove(id);
    return ok(id);
  };

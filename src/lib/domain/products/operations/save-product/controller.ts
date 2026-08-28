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
import type { Product, ProductId, ProductStatus } from "../../entity";
import type { NewAttachment, ProductRepository } from "../../repository";
import {
  type SaveProductErrors,
  type SaveProductInput,
  validateSaveProduct,
} from "./invariants";

export type SaveProductDeps = {
  readonly productRepo: ProductRepository;
  readonly categoryRepo: CategoryRepository;
};

export type SaveProductCommand = {
  /** Absent for a create. */
  readonly id?: ProductId;
  readonly input: SaveProductInput;
};

export type SaveProductFailure =
  | SaveProductErrors
  | { readonly tag: "ProductNotFound"; readonly id: ProductId };

const toNewAttachments = (
  attachments: SaveProductInput["attachments"],
): readonly NewAttachment[] =>
  attachments.map((a) => ({
    kind: a.kind as "image" | "video",
    originUrl: a.originUrl,
    optimizedUrl: a.optimizedUrl,
    posterUrl: a.posterUrl,
    mime: a.mime,
    bytes: a.bytes,
    optimizedBytes: a.optimizedBytes,
    width: a.width,
    height: a.height,
    durationMs: a.durationMs,
    alt: a.alt?.trim() === "" ? null : (a.alt ?? null),
  }));

export const createSaveProduct =
  ({ productRepo, categoryRepo }: SaveProductDeps) =>
  async (
    command: SaveProductCommand,
  ): Promise<Result<SaveProductFailure, Product>> => {
    const { id, input } = command;

    if (id) {
      const existing = await productRepo.getById(id);
      if (!existing) return err({ tag: "ProductNotFound", id });
    }

    const [takenSlugs, categories] = await Promise.all([
      productRepo.takenSlugs(id),
      categoryRepo.list(),
    ]);
    const sku = input.sku.trim();
    const skuTaken = sku === "" ? false : await productRepo.skuTaken(sku, id);

    const validated = validateSaveProduct(input, {
      takenSlugs,
      skuTaken,
      knownCategoryIds: new Set(categories.map((c) => c.id as string)),
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
    await productRepo.setAttachments(
      product.id,
      toNewAttachments(v.attachments),
    );

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
    // The uploaded files are deliberately left behind — see backlog L.1. A
    // best-effort delete here would half-succeed on a network blip and leave
    // the row pointing at bytes that are sometimes gone.
    await productRepo.remove(id);
    return ok(id);
  };

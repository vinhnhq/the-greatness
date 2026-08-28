/**
 * `Product` — a plain row, and the media it links to.
 *
 * **A product no longer owns its media** (migration 004). It links to assets
 * in the library, and the link carries the order. `Attachment` is gone; the
 * row lives in `domain/media/entity.ts` as `MediaAsset`, and a product's
 * gallery is `readonly MediaAsset[]` in link order.
 *
 * `ProductStatus` is a union, not a string: `draft | active | archived` is the
 * whole lifecycle, and a `ts-pattern` match over it fails to compile when a
 * fourth state is added and a branch is forgotten.
 */

import type { Tagged } from "type-fest";
import { z } from "zod";

import { type Currency, isCurrency } from "@/lib/money";
import { err, ok, type Result } from "@/lib/result";

import type { CategoryId } from "../categories/entity";
import type { MediaAsset } from "../media/entity";

export type ProductId = Tagged<string, "ProductId">;

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const isProductStatus = (value: string): value is ProductStatus =>
  (PRODUCT_STATUSES as readonly string[]).includes(value);

export const PRODUCT_NAME_MAX = 140;
export const PRODUCT_SKU_MAX = 60;
export const PRODUCT_DESCRIPTION_MAX = 5_000;

/** How many assets one product's gallery may carry. Not a storage limit: past
 * roughly this many, the reorder grid stops being usable. */
export const MAX_MEDIA_PER_PRODUCT = 20;

export interface Product {
  readonly id: ProductId;
  readonly name: string;
  readonly slug: string;
  readonly sku: string | null;
  readonly description: string | null;
  readonly priceMinor: number;
  readonly currency: Currency;
  readonly status: ProductStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A product with everything the list and the edit form need — one shape, so
 * the two surfaces cannot drift into needing different queries. */
export interface ProductWithRelations extends Product {
  readonly categoryIds: readonly CategoryId[];
  /** In link order, which is this product's gallery order — not the order the
   * assets were uploaded in. */
  readonly media: readonly MediaAsset[];
}

const productRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  sku: z.string().nullable(),
  description: z.string().nullable(),
  // SQLite hands integers back as numbers, Postgres can hand a bigint column
  // back as a string; coercion covers both without a driver check.
  priceMinor: z.coerce.number().int(),
  currency: z.string().refine(isCurrency, "unknown currency"),
  status: z.string().refine(isProductStatus, "unknown status"),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type ParseProductError = {
  readonly tag: "ParseProductError";
  readonly issues: readonly string[];
};

const issuesOf = (error: z.ZodError): readonly string[] =>
  error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);

export const parseProduct = (
  raw: unknown,
): Result<ParseProductError, Product> => {
  const parsed = productRowSchema.safeParse(raw);
  if (!parsed.success) {
    return err({ tag: "ParseProductError", issues: issuesOf(parsed.error) });
  }
  const d = parsed.data;
  return ok({
    id: d.id as ProductId,
    name: d.name,
    slug: d.slug,
    sku: d.sku,
    description: d.description,
    priceMinor: d.priceMinor,
    currency: d.currency as Currency,
    status: d.status as ProductStatus,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  });
};

export const parseProductStrict = (raw: unknown): Product => {
  const r = parseProduct(raw);
  if (r.ok) return r.value;
  throw new Error(
    `parseProductStrict: schema drift — ${r.error.issues.join(", ")}`,
  );
};

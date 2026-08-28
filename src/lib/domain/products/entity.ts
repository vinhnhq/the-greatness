/**
 * `Product` and `Attachment` — plain rows.
 *
 * Two shapes worth naming:
 *
 *   - **`ProductStatus` is a union, not a string.** `draft | active | archived`
 *     is the whole lifecycle; a `ts-pattern` match over it fails to compile
 *     when a fourth state is added and a branch is forgotten.
 *   - **An attachment's `optimizedUrl` is nullable and that is normal**, not an
 *     error state. `lib/media/prepare.ts` declines to store a re-encode that
 *     came out larger, and keeps the origin when a decode fails. Readers use
 *     `displayUrl()` rather than reaching for one field.
 */

import type { Tagged } from "type-fest";
import { z } from "zod";

import { type Currency, isCurrency } from "@/lib/money";
import { err, ok, type Result } from "@/lib/result";

import type { CategoryId } from "../categories/entity";

export type ProductId = Tagged<string, "ProductId">;
export type AttachmentId = Tagged<string, "AttachmentId">;

export const PRODUCT_STATUSES = ["draft", "active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const isProductStatus = (value: string): value is ProductStatus =>
  (PRODUCT_STATUSES as readonly string[]).includes(value);

export const PRODUCT_NAME_MAX = 140;
export const PRODUCT_SKU_MAX = 60;
export const PRODUCT_DESCRIPTION_MAX = 5_000;
export const ATTACHMENT_ALT_MAX = 200;

export interface Attachment {
  readonly id: AttachmentId;
  readonly productId: ProductId;
  readonly kind: "image" | "video";
  readonly originUrl: string;
  readonly optimizedUrl: string | null;
  readonly posterUrl: string | null;
  readonly mime: string;
  readonly bytes: number;
  readonly optimizedBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly position: number;
  readonly alt: string | null;
  readonly createdAt: Date;
}

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
  readonly attachments: readonly Attachment[];
}

/**
 * What to render for an attachment: the optimized variant when there is one,
 * the poster for a video, the origin otherwise. One function, because
 * `a.optimizedUrl ?? a.originUrl` written at six call sites is six chances to
 * forget that a video's thumbnail is the poster, not the video.
 */
export const displayUrl = (attachment: Attachment): string =>
  attachment.kind === "video"
    ? (attachment.posterUrl ?? attachment.originUrl)
    : (attachment.optimizedUrl ?? attachment.originUrl);

/** The image a product shows in a list: the first image by position. A video
 * is never a product's thumbnail — its poster is a frame, not a chosen shot. */
export const primaryImage = (
  attachments: readonly Attachment[],
): Attachment | null =>
  [...attachments]
    .sort((a, b) => a.position - b.position)
    .find((a) => a.kind === "image") ?? null;

const attachmentRowSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  kind: z.enum(["image", "video"]),
  originUrl: z.string().min(1),
  optimizedUrl: z.string().min(1).nullable(),
  posterUrl: z.string().min(1).nullable(),
  mime: z.string().min(1),
  bytes: z.coerce.number().int().nonnegative(),
  optimizedBytes: z.coerce.number().int().nonnegative().nullable(),
  width: z.coerce.number().int().positive().nullable(),
  height: z.coerce.number().int().positive().nullable(),
  durationMs: z.coerce.number().int().nonnegative().nullable(),
  position: z.coerce.number().int().nonnegative(),
  alt: z.string().nullable(),
  createdAt: z.coerce.date(),
});

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

export const parseAttachment = (
  raw: unknown,
): Result<ParseProductError, Attachment> => {
  const parsed = attachmentRowSchema.safeParse(raw);
  if (!parsed.success) {
    return err({ tag: "ParseProductError", issues: issuesOf(parsed.error) });
  }
  const d = parsed.data;
  return ok({
    ...d,
    id: d.id as AttachmentId,
    productId: d.productId as ProductId,
  });
};

export const parseAttachmentStrict = (raw: unknown): Attachment => {
  const r = parseAttachment(raw);
  if (r.ok) return r.value;
  throw new Error(
    `parseAttachmentStrict: schema drift — ${r.error.issues.join(", ")}`,
  );
};

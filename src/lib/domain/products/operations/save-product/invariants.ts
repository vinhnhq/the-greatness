/**
 * What a product must satisfy before it is written. Pure: every dependency —
 * the slugs already taken, whether the sku is free — arrives as a parameter,
 * so this file has no idea a database exists and the tests need no fixture.
 *
 * Failures are **all** collected, not short-circuited on the first. A form
 * that reports "name is required", is fixed, and then reports "price must be
 * a number" trains people to submit repeatedly to discover what else is
 * wrong. Everything wrong is reported at once.
 */

import { MAX_ATTACHMENTS_PER_PRODUCT } from "@/lib/media/constraints";
import { isCurrency } from "@/lib/money";
import { err, ok, type Result } from "@/lib/result";
import { slugify } from "@/lib/slug";

import type { CategoryId } from "../../../categories/entity";
import {
  ATTACHMENT_ALT_MAX,
  isProductStatus,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  PRODUCT_SKU_MAX,
} from "../../entity";

/** The raw shape a form submits — every field a string or a list, because
 * that is what a `FormData` carries. Coercion happens here, once. */
export type SaveProductInput = {
  readonly name: string;
  /** Blank means "derive it from the name". */
  readonly slug: string;
  readonly sku: string;
  readonly description: string;
  /** Already parsed into minor units by `lib/money.ts` at the form edge. */
  readonly priceMinor: number | null;
  readonly currency: string;
  readonly status: string;
  readonly categoryIds: readonly string[];
  readonly attachments: readonly {
    readonly kind: string;
    readonly originUrl: string;
    readonly optimizedUrl: string | null;
    readonly posterUrl: string | null;
    readonly mime: string;
    readonly bytes: number;
    readonly optimizedBytes: number | null;
    readonly width: number | null;
    readonly height: number | null;
    readonly durationMs: number | null;
    readonly alt: string | null;
  }[];
};

/** A failure named by the field it belongs to, so the form can put each
 * message where the reader is looking. */
export type FieldError = {
  readonly field:
    | "name"
    | "slug"
    | "sku"
    | "description"
    | "price"
    | "currency"
    | "status"
    | "categoryIds"
    | "attachments";
  readonly code: string;
};

export type SaveProductErrors = {
  readonly tag: "SaveProductInvalid";
  readonly errors: readonly FieldError[];
};

/** The validated, normalised shape the controller writes. */
export type ValidatedProduct = {
  readonly name: string;
  readonly slug: string;
  readonly sku: string | null;
  readonly description: string | null;
  readonly priceMinor: number;
  readonly currency: string;
  readonly status: string;
  readonly categoryIds: readonly CategoryId[];
  readonly attachments: SaveProductInput["attachments"];
};

export type ValidationContext = {
  /** Slugs already in use, excluding the product being edited. */
  readonly takenSlugs: ReadonlySet<string>;
  /** Whether this sku belongs to a different product. */
  readonly skuTaken: boolean;
  /** Categories that exist — a stale form must not link to a deleted one. */
  readonly knownCategoryIds: ReadonlySet<string>;
};

export const validateSaveProduct = (
  input: SaveProductInput,
  context: ValidationContext,
): Result<SaveProductErrors, ValidatedProduct> => {
  const errors: FieldError[] = [];

  const name = input.name.trim();
  if (name === "") errors.push({ field: "name", code: "required" });
  if (name.length > PRODUCT_NAME_MAX) {
    errors.push({ field: "name", code: "too-long" });
  }

  // A blank slug is not an error — it means "derive one". Only an explicitly
  // typed slug that cannot survive slugification is.
  const typedSlug = input.slug.trim();
  const slug = typedSlug === "" ? slugify(name) : slugify(typedSlug);
  if (typedSlug !== "" && slug === "") {
    errors.push({ field: "slug", code: "invalid" });
  }
  // A collision is only an error for a slug someone **typed**. A derived one
  // that collides means two products share a name, which is legitimate — the
  // controller suffixes it. Rejecting both here made the controller's
  // suffixing unreachable, which is what the "two products share a name" test
  // caught.
  if (typedSlug !== "" && slug !== "" && context.takenSlugs.has(slug)) {
    errors.push({ field: "slug", code: "taken" });
  }

  const sku = input.sku.trim();
  if (sku.length > PRODUCT_SKU_MAX) {
    errors.push({ field: "sku", code: "too-long" });
  }
  if (sku !== "" && context.skuTaken) {
    errors.push({ field: "sku", code: "taken" });
  }

  const description = input.description.trim();
  if (description.length > PRODUCT_DESCRIPTION_MAX) {
    errors.push({ field: "description", code: "too-long" });
  }

  if (input.priceMinor === null) {
    errors.push({ field: "price", code: "invalid" });
  } else if (!Number.isSafeInteger(input.priceMinor)) {
    errors.push({ field: "price", code: "invalid" });
  } else if (input.priceMinor < 0) {
    // A negative price is not a discount; it is a data-entry slip that would
    // sum a report into nonsense.
    errors.push({ field: "price", code: "negative" });
  }

  if (!isCurrency(input.currency)) {
    errors.push({ field: "currency", code: "invalid" });
  }
  if (!isProductStatus(input.status)) {
    errors.push({ field: "status", code: "invalid" });
  }

  const categoryIds = [
    ...new Set(input.categoryIds.map((id) => id.trim())),
  ].filter((id) => id !== "");
  if (categoryIds.some((id) => !context.knownCategoryIds.has(id))) {
    // A form left open while someone else deleted a category would otherwise
    // write a link to a row that no longer exists, and the product would
    // silently vanish from every category filter.
    errors.push({ field: "categoryIds", code: "unknown" });
  }

  if (input.attachments.length > MAX_ATTACHMENTS_PER_PRODUCT) {
    errors.push({ field: "attachments", code: "too-many" });
  }
  for (const attachment of input.attachments) {
    if (attachment.kind !== "image" && attachment.kind !== "video") {
      errors.push({ field: "attachments", code: "invalid-kind" });
      break;
    }
  }
  if (input.attachments.some((a) => a.originUrl.trim() === "")) {
    // The origin is the one file that cannot be regenerated. A row without it
    // is an attachment that renders nothing and can never be repaired.
    errors.push({ field: "attachments", code: "missing-origin" });
  }
  if (
    input.attachments.some((a) => (a.alt ?? "").length > ATTACHMENT_ALT_MAX)
  ) {
    errors.push({ field: "attachments", code: "alt-too-long" });
  }

  if (errors.length > 0) return err({ tag: "SaveProductInvalid", errors });

  return ok({
    name,
    slug,
    sku: sku === "" ? null : sku,
    description: description === "" ? null : description,
    priceMinor: input.priceMinor as number,
    currency: input.currency,
    status: input.status,
    categoryIds: categoryIds as CategoryId[],
    attachments: input.attachments,
  });
};

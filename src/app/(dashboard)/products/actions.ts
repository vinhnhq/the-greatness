"use server";

/**
 * The product write path.
 *
 * Each action calls `requireUser()` itself. That is not defensive
 * duplication of the layout's gate: a server action is its own HTTP endpoint,
 * reachable by anyone who can POST to it, and the `(dashboard)` layout never
 * runs for that request.
 *
 * `withTransaction` wraps the write so the product row, its category links
 * and its attachment rows commit together. Without it, a failure between the
 * second and third write leaves a saved product whose gallery is the previous
 * version's — which looks like the save worked.
 */

import { revalidatePath } from "next/cache";

import { baseContext, runWithContext, withTransaction } from "@/lib/context";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import type { ProductId } from "@/lib/domain/products/entity";
import {
  createDeleteProduct,
  createSaveProduct,
} from "@/lib/domain/products/operations/save-product/controller";
import type { SaveProductInput } from "@/lib/domain/products/operations/save-product/invariants";
import { dbProductRepo } from "@/lib/domain/products/repository";
import { requireUser } from "@/lib/require-user";

export type SaveProductState =
  | { readonly status: "idle" }
  | { readonly status: "saved"; readonly id: string; readonly slug: string }
  | {
      readonly status: "invalid";
      /** field → message, ready for the form to place beside each input. */
      readonly errors: Readonly<Record<string, string>>;
    }
  | { readonly status: "missing" };

/** Codes from the pure invariants, worded for a person. The invariants cannot
 * know the reader; this is the boundary that can. */
const MESSAGES: Readonly<Record<string, string>> = {
  "name:required": "A product needs a name.",
  "name:too-long": "That name is too long.",
  "slug:invalid": "That slug has no usable characters.",
  "slug:taken": "Another product already uses that slug.",
  "sku:too-long": "That SKU is too long.",
  "sku:taken": "Another product already uses that SKU.",
  "description:too-long": "That description is too long.",
  "price:invalid": "Enter the price as a number.",
  "price:negative": "A price cannot be negative.",
  "currency:invalid": "Choose a currency.",
  "status:invalid": "Choose a status.",
  "categoryIds:unknown":
    "One of those categories no longer exists — reload and pick again.",
  "attachments:too-many": "That is more attachments than a product can carry.",
  "attachments:invalid-kind": "One attachment is neither an image nor a video.",
  "attachments:missing-origin":
    "One attachment did not finish uploading. Remove it and try again.",
  "attachments:alt-too-long": "One alt text is too long.",
};

export async function saveProduct(
  input: SaveProductInput & { readonly id?: string },
): Promise<SaveProductState> {
  const user = await requireUser();

  return runWithContext(baseContext(user), async () => {
    const save = createSaveProduct({
      productRepo: dbProductRepo,
      categoryRepo: dbCategoryRepo,
    });

    const result = await withTransaction(() =>
      save({
        id: input.id as ProductId | undefined,
        input,
      }),
    );

    if (!result.ok) {
      if (result.error.tag === "ProductNotFound") return { status: "missing" };
      const errors: Record<string, string> = {};
      for (const { field, code } of result.error.errors) {
        // First message per field wins — a field with two problems shows the
        // first, and fixing it reveals the second.
        errors[field] ??=
          MESSAGES[`${field}:${code}`] ?? "That value is not valid.";
      }
      return { status: "invalid", errors };
    }

    revalidatePath("/products");
    revalidatePath(`/products/${result.value.id}`);
    return {
      status: "saved",
      id: result.value.id,
      slug: result.value.slug,
    };
  });
}

export async function deleteProduct(
  id: string,
): Promise<{ readonly ok: boolean }> {
  const user = await requireUser();

  return runWithContext(baseContext(user), async () => {
    const remove = createDeleteProduct({ productRepo: dbProductRepo });
    const result = await withTransaction(() => remove(id as ProductId));
    revalidatePath("/products");
    return { ok: result.ok };
  });
}

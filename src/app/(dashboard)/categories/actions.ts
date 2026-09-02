"use server";

/**
 * Category writes. Each one re-gates with `requireUser()` — a server action is
 * its own endpoint and the layout's check never runs for it.
 *
 * Slugs are derived and de-duplicated here rather than typed: a category slug
 * is never shown in a URL, so asking someone to choose one would be asking
 * for a decision that has no consequence.
 */

import { revalidatePath } from "next/cache";

import { baseContext, runWithContext } from "@/lib/context";
import type { CategoryId } from "@/lib/domain/categories/entity";
import { CATEGORY_NAME_MAX } from "@/lib/domain/categories/entity";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import { planMove } from "@/lib/domain/categories/tree";
import type { ProductId } from "@/lib/domain/products/entity";
import { dbProductRepo } from "@/lib/domain/products/repository";
import { requireUser } from "@/lib/require-user";
import { slugify, uniqueSlug } from "@/lib/slug";

export type CategoryActionState =
  | { readonly status: "ok" }
  | { readonly status: "error"; readonly message: string };

const validateName = (raw: string): string | null => {
  const name = raw.trim();
  if (name === "") return null;
  if (name.length > CATEGORY_NAME_MAX) return null;
  return name;
};

export async function createCategory(
  rawName: string,
  /** Absent means top level. The repository has always accepted a parent;
   * until the row menu there was no way to say one. */
  parentId?: string,
): Promise<CategoryActionState> {
  const user = await requireUser();
  const name = validateName(rawName);
  if (!name) {
    return { status: "error", message: "Enter a name of 1–60 characters." };
  }

  return runWithContext(baseContext(user), async () => {
    const existing = await dbCategoryRepo.list();
    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return { status: "error", message: "That category already exists." };
    }

    if (parentId !== undefined && !existing.some((c) => c.id === parentId)) {
      return { status: "error", message: "That parent is gone." };
    }

    await dbCategoryRepo.create({
      name,
      // Two categories may legitimately slugify the same way ("Áo dài" and
      // "Ao dai"); the name check above is what stops a true duplicate.
      slug: uniqueSlug(name, await dbCategoryRepo.takenSlugs()),
      parentId: parentId as CategoryId | undefined,
    });
    revalidatePath("/categories");
    revalidatePath("/products");
    return { status: "ok" };
  });
}

export async function renameCategory(
  id: string,
  rawName: string,
): Promise<CategoryActionState> {
  const user = await requireUser();
  const name = validateName(rawName);
  if (!name) {
    return { status: "error", message: "Enter a name of 1–60 characters." };
  }

  return runWithContext(baseContext(user), async () => {
    const categoryId = id as CategoryId;
    const existing = await dbCategoryRepo.list();
    if (
      existing.some(
        (c) =>
          c.id !== categoryId && c.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      return { status: "error", message: "Another category has that name." };
    }

    const slug = slugify(name);
    const taken = await dbCategoryRepo.takenSlugs(categoryId);
    const updated = await dbCategoryRepo.rename(
      categoryId,
      name,
      taken.has(slug) ? uniqueSlug(name, taken) : slug,
    );
    if (!updated) {
      return { status: "error", message: "That category no longer exists." };
    }

    revalidatePath("/categories");
    revalidatePath("/products");
    return { status: "ok" };
  });
}

export async function deleteCategory(id: string): Promise<CategoryActionState> {
  const user = await requireUser();

  return runWithContext(baseContext(user), async () => {
    // `remove` drops the links and leaves the products — deleting a category
    // must never delete stock.
    await dbCategoryRepo.remove(id as CategoryId);
    revalidatePath("/categories");
    revalidatePath("/products");
    return { status: "ok" };
  });
}

/**
 * Re-parent a category by dragging it.
 *
 * `parentId` is ours: Sapo has no hierarchy at all, and `sync:sapo` never
 * writes this column, so nothing here can be undone by the next sync. That is
 * the difference between this and `assignCategory` below.
 *
 * The whole decision lives in `planMove`, which is pure and tested — the cycle
 * guard in particular, since a category dropped inside itself would leave a
 * subtree with no root.
 */
export async function moveCategory(
  id: string,
  targetId: string | null,
): Promise<CategoryActionState> {
  const user = await requireUser();

  return runWithContext(baseContext(user), async () => {
    const all = await dbCategoryRepo.list();
    const plan = planMove(
      all.map((c) => ({ ...c, productCount: 0 })),
      id,
      targetId,
    );
    if (!plan.ok) return { status: "error", message: plan.reason };

    await dbCategoryRepo.setParent(
      plan.id as CategoryId,
      plan.parentId as CategoryId | null,
    );
    revalidatePath("/categories");
    return { status: "ok" };
  });
}

/**
 * Put a product in a category by dragging it.
 *
 * Unlike `moveCategory`, this writes `product_categories`, which Sapo also
 * owns — so it is only safe because of the mirror. The three-way merge sees an
 * addition we made and Sapo did not, and keeps it. Before v6 the next
 * `sync:sapo` recomputed the link set from Sapo and deleted this.
 */
export async function assignCategory(
  productId: string,
  categoryId: string,
): Promise<CategoryActionState> {
  const user = await requireUser();

  return runWithContext(baseContext(user), async () => {
    const product = await dbProductRepo.getById(productId as ProductId);
    if (product === null) {
      return { status: "error", message: "That product is gone." };
    }
    if (product.categoryIds.includes(categoryId as CategoryId)) {
      return { status: "error", message: "It is already in that category." };
    }
    await dbProductRepo.setCategories(productId as ProductId, [
      ...product.categoryIds,
      categoryId as CategoryId,
    ]);
    revalidatePath("/categories");
    revalidatePath("/products");
    return { status: "ok" };
  });
}

/**
 * Take a product out of one category, leaving the rest alone.
 *
 * The counterpart to `assignCategory`, and the reason a product row's menu
 * says "remove from this category" and never "delete": a product here sits in
 * as many as eleven, so the category it was clicked in is the only unambiguous
 * thing to remove.
 *
 * Same mirror caveat. A removal we made and Sapo did not is a set member we
 * dropped; the three-way merge keeps it dropped rather than restoring it on
 * the next run.
 */
export async function unassignCategory(
  productId: string,
  categoryId: string,
): Promise<CategoryActionState> {
  const user = await requireUser();

  return runWithContext(baseContext(user), async () => {
    const product = await dbProductRepo.getById(productId as ProductId);
    if (product === null) {
      return { status: "error", message: "That product is gone." };
    }
    if (!product.categoryIds.includes(categoryId as CategoryId)) {
      return { status: "error", message: "It is not in that category." };
    }
    await dbProductRepo.setCategories(
      productId as ProductId,
      product.categoryIds.filter((id) => id !== categoryId),
    );
    revalidatePath("/categories");
    revalidatePath("/products");
    return { status: "ok" };
  });
}

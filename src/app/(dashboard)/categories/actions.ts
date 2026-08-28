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

    await dbCategoryRepo.create({
      name,
      // Two categories may legitimately slugify the same way ("Áo dài" and
      // "Ao dai"); the name check above is what stops a true duplicate.
      slug: uniqueSlug(name, await dbCategoryRepo.takenSlugs()),
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

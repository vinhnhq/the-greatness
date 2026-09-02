/**
 * The category tree with its products hanging off it. Pure — no I/O.
 *
 * **Its own file, not `tree.ts`.** That module is about categories and is
 * imported by three call sites that want nothing to do with products; this is
 * the composition on top of it, and it is imported by a client component, so
 * it also has to stay clear of anything that reaches a repository.
 *
 * **The Unfiled list is not a rounding error.** 697 of this catalogue's 832
 * products are in no category at all, and 191 of its 211 categories are
 * empty. A tree that only shows filed products shows a sixth of the shop, so
 * the products with no home are a first-class part of the structure rather
 * than an omission to be noticed later.
 *
 * **A product appears once per category it is in, and that is correct.** One
 * product here sits in as many as eleven. The tree is a view over a
 * many-to-many, not a filesystem, which is why a row's menu offers "remove
 * from this category" and never "delete".
 */

import { foldForSearch } from "@/lib/search-text";

import type { CategoryLink, CategoryNode, TreeCategory } from "./tree";

/** The least a product needs to be a leaf. No media — the tree draws icons. */
export type TreeProduct = {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly status: string;
};

export type GroupedProducts = {
  /** Products filed directly under a category id. Absent means none. */
  readonly byCategory: ReadonlyMap<string, readonly TreeProduct[]>;
  /** Products in no category at all — the 697. */
  readonly unfiled: readonly TreeProduct[];
};

/**
 * Products bucketed by the category they are filed in, plus the leftovers.
 *
 * Order is the order given, which the repository has already sorted by name;
 * re-sorting per bucket would be the same comparison run 211 times.
 */
export const groupProducts = (
  products: readonly TreeProduct[],
  links: readonly CategoryLink[],
): GroupedProducts => {
  const categoriesOf = new Map<string, string[]>();
  for (const link of links) {
    const existing = categoriesOf.get(link.productId);
    if (existing === undefined)
      categoriesOf.set(link.productId, [link.categoryId]);
    else existing.push(link.categoryId);
  }

  const byCategory = new Map<string, TreeProduct[]>();
  const unfiled: TreeProduct[] = [];

  for (const product of products) {
    const categoryIds = categoriesOf.get(product.id);
    if (categoryIds === undefined || categoryIds.length === 0) {
      unfiled.push(product);
      continue;
    }
    for (const categoryId of categoryIds) {
      const bucket = byCategory.get(categoryId);
      if (bucket === undefined) byCategory.set(categoryId, [product]);
      else bucket.push(product);
    }
  }

  return { byCategory, unfiled };
};

const matches = (haystack: string, foldedTerm: string): boolean =>
  foldForSearch(haystack).includes(foldedTerm);

/**
 * The tree narrowed to a search, over categories **and** products at once.
 *
 * A category survives if its own name matches, or a descendant survives, or
 * one of its products matches — and a category that matches keeps all of its
 * products, because typing a category name is how you ask what is in it.
 *
 * Folded the way search folds everywhere else in this app, so `quat` finds
 * `Quạt`: `LOWER()` is ASCII-only, so case is never folded in SQL and never
 * folded differently here.
 */
export const filterTaxonomy = <T extends TreeCategory>(
  forest: readonly CategoryNode<T>[],
  grouped: GroupedProducts,
  term: string,
): {
  readonly forest: readonly CategoryNode<T>[];
  readonly grouped: GroupedProducts;
} => {
  const folded = foldForSearch(term);
  if (folded === "") return { forest, grouped };

  const productMatches = (p: TreeProduct): boolean =>
    matches(p.name, folded) || (p.sku !== null && matches(p.sku, folded));

  const kept = new Map<string, readonly TreeProduct[]>();

  /** Everything under a category that matched by name, products included. */
  const keepWhole = (node: CategoryNode<T>): void => {
    const own = grouped.byCategory.get(node.category.id);
    if (own !== undefined) kept.set(node.category.id, own);
    for (const child of node.children) keepWhole(child);
  };

  const walk = (
    nodes: readonly CategoryNode<T>[],
  ): readonly CategoryNode<T>[] =>
    nodes.flatMap((node) => {
      if (matches(node.category.name, folded)) {
        keepWhole(node);
        return [node];
      }

      const own = (grouped.byCategory.get(node.category.id) ?? []).filter(
        productMatches,
      );
      const children = walk(node.children);
      if (own.length === 0 && children.length === 0) return [];

      if (own.length > 0) kept.set(node.category.id, own);
      return [{ ...node, children }];
    });

  return {
    forest: walk(forest),
    grouped: {
      byCategory: kept,
      unfiled: grouped.unfiled.filter(productMatches),
    },
  };
};

/**
 * The category hierarchy, shaped for rendering. Pure — no I/O, no context.
 *
 * **Its own file, not the repository's.** The categories table is a client
 * component, and a client component that imports a repository module drags
 * `readContext` → `db.ts` → `node:async_hooks` and the Neon driver into the
 * browser bundle and fails the route's build. This has happened twice; see
 * `media/grouping.ts` for the same split and the same reason.
 *
 * **Why subtree counts are distinct rather than summed.** A product can be
 * linked to a parent *and* to its child. That is not hypothetical here: eight
 * fans sit in "Quạt & Thiết bị làm mát" and in all nine of its children, so
 * summing descendants reports eighty. Counting distinct product ids per
 * subtree is the only version of this number that is true, which is why this
 * function takes the links rather than just the per-category totals.
 *
 * The link list is small — 280 rows for 832 products — and stays proportional
 * to categorisations rather than to the catalogue, so carrying it into the
 * page is cheaper than a recursive query that both drivers would have to
 * agree on.
 */

/** The shape this needs, structurally — any row with these fields will do. */
export type TreeCategory = {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly productCount: number;
};

export type CategoryLink = {
  readonly categoryId: string;
  readonly productId: string;
};

export type CategoryNode<T extends TreeCategory = TreeCategory> = {
  readonly category: T;
  readonly children: readonly CategoryNode<T>[];
  /** 0 for a root. Lets a row indent without walking back up the tree. */
  readonly depth: number;
  /** Products linked to this category itself. */
  readonly ownCount: number;
  /** Distinct products anywhere in this subtree, this category included. */
  readonly subtreeCount: number;
};

const byName = <T extends TreeCategory>(a: T, b: T): number =>
  a.name.localeCompare(b.name, "vi");

/**
 * Roots first, each with its children nested beneath it.
 *
 * A row whose `parentId` names a category that is not in the list is treated
 * as a root rather than dropped — a dangling reference should show up as a
 * misplaced row someone can fix, not as a category that silently vanished
 * from the page.
 */
export const buildCategoryForest = <T extends TreeCategory>(
  categories: readonly T[],
  links: readonly CategoryLink[],
): readonly CategoryNode<T>[] => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const childrenOf = new Map<string, T[]>();
  const roots: T[] = [];

  for (const c of categories) {
    const parent = c.parentId !== null ? byId.get(c.parentId) : undefined;
    if (parent === undefined) {
      roots.push(c);
      continue;
    }
    childrenOf.set(c.parentId!, [...(childrenOf.get(c.parentId!) ?? []), c]);
  }

  const productsOf = new Map<string, Set<string>>();
  for (const l of links) {
    const set = productsOf.get(l.categoryId) ?? new Set<string>();
    set.add(l.productId);
    productsOf.set(l.categoryId, set);
  }

  /**
   * The node plus the product-id set its parent needs to union. The set is
   * internal: exposing it would put an unbounded structure on every row of a
   * server-to-client payload for no reader's benefit.
   *
   * `seen` is a cycle guard. Nothing creates a cycle today — the tree is
   * seeded from a derivation that cannot express one — but it becomes
   * editable later, and a page that hangs is a worse failure than a row in
   * the wrong place.
   */
  type Built = {
    readonly node: CategoryNode<T>;
    readonly productIds: ReadonlySet<string>;
  };

  const build = (
    category: T,
    depth: number,
    seen: ReadonlySet<string>,
  ): Built => {
    const nextSeen = new Set(seen).add(category.id);
    const built = (childrenOf.get(category.id) ?? [])
      .filter((c) => !nextSeen.has(c.id))
      .sort(byName)
      .map((c) => build(c, depth + 1, nextSeen));

    const distinct = new Set(productsOf.get(category.id) ?? []);
    for (const child of built) {
      for (const id of child.productIds) distinct.add(id);
    }

    return {
      node: {
        category,
        children: built.map((b) => b.node),
        depth,
        ownCount: category.productCount,
        subtreeCount: distinct.size,
      },
      productIds: distinct,
    };
  };

  const forest = roots.sort(byName).map((r) => build(r, 0, new Set()).node);

  // A cycle has no root, so nothing above would reach its members and they
  // would drop off the page entirely. Anything unreached is promoted to the
  // top level: a category in the wrong place is fixable, one that is not
  // rendered at all is invisible.
  const reached = new Set<string>();
  const mark = (nodes: readonly CategoryNode<T>[]): void => {
    for (const n of nodes) {
      reached.add(n.category.id);
      mark(n.children);
    }
  };
  mark(forest);

  const stranded = categories.filter((c) => !reached.has(c.id));
  if (stranded.length === 0) return forest;

  const extra: CategoryNode<T>[] = [];
  for (const c of stranded.sort(byName)) {
    if (reached.has(c.id)) continue;
    const node = build(c, 0, new Set()).node;
    mark([node]);
    extra.push(node);
  }
  return [...forest, ...extra];
};

/** Depth-first, parents before children — the order the table renders in. */
export const flattenForest = <T extends TreeCategory>(
  forest: readonly CategoryNode<T>[],
): readonly CategoryNode<T>[] =>
  forest.flatMap((node) => [node, ...flattenForest(node.children)]);

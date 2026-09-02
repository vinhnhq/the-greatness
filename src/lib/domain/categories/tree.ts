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

/**
 * The forest narrowed to a search, keeping enough of it to stay legible.
 *
 * A node survives if it matches **or any descendant does**. Without that,
 * typing part of a leaf name hides the group it lives under and the results
 * read as a flat list of near-identical names — which is exactly the problem
 * a grouped picker exists to fix. A node that matches keeps its whole
 * subtree, so typing a group name is how you see what is in it.
 */
export const filterForest = <T extends TreeCategory>(
  forest: readonly CategoryNode<T>[],
  matches: (category: T) => boolean,
): readonly CategoryNode<T>[] =>
  forest.flatMap((node) => {
    if (matches(node.category)) return [node];
    const children = filterForest(node.children, matches);
    return children.length > 0 ? [{ ...node, children }] : [];
  });

/**
 * The names of a category's ancestors, outermost first.
 *
 * Used to caption a search result: "Quạt đứng" alone is ambiguous among nine
 * near-identical fan categories, and "Thiết bị gia đình › Quạt & Thiết bị làm
 * mát" is what tells them apart. Guards against a cycle for the same reason
 * `buildCategoryForest` does.
 */
export const ancestorsOf = <T extends TreeCategory>(
  categories: readonly T[],
  id: string,
): readonly T[] => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: T[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    const parent = byId.get(current);
    if (parent === undefined) break;
    seen.add(current);
    path.unshift(parent);
    current = parent.parentId;
  }
  return path;
};

export const ancestorNames = <T extends TreeCategory>(
  categories: readonly T[],
  id: string,
): readonly string[] => ancestorsOf(categories, id).map((c) => c.name);

/**
 * Every category's ancestor names, computed once for the whole list.
 *
 * `ancestorNames` rebuilds its index on each call, which is right for one
 * lookup and wrong for 211 of them — the flat list and the move picker both
 * caption every row with its path, and doing that a row at a time is a
 * quadratic walk over a list that already fits in memory.
 *
 * Memoised down the tree, so a deep path costs its parent's path plus one.
 * The cycle guard matches `ancestorsOf`: a row that reaches itself gets the
 * path found so far rather than hanging.
 */
export const categoryPaths = <T extends TreeCategory>(
  categories: readonly T[],
): ReadonlyMap<string, readonly string[]> => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const paths = new Map<string, readonly string[]>();

  const pathOf = (id: string, seen: ReadonlySet<string>): readonly string[] => {
    const cached = paths.get(id);
    if (cached !== undefined) return cached;

    const parentId = byId.get(id)?.parentId ?? null;
    const parent = parentId === null ? undefined : byId.get(parentId);
    const path =
      parent === undefined || seen.has(parent.id)
        ? []
        : [...pathOf(parent.id, new Set([...seen, parent.id])), parent.name];

    paths.set(id, path);
    return path;
  };

  for (const category of categories)
    pathOf(category.id, new Set([category.id]));
  return paths;
};

/**
 * One node by id, wherever it sits — with its children and counts intact, so
 * the drill-down does not rebuild what the forest already computed.
 */
export const findNode = <T extends TreeCategory>(
  forest: readonly CategoryNode<T>[],
  id: string,
): CategoryNode<T> | null => {
  for (const node of forest) {
    if (node.category.id === id) return node;
    const found = findNode(node.children, id);
    if (found !== null) return found;
  }
  return null;
};

export type MovePlan =
  | { readonly ok: true; readonly id: string; readonly parentId: string | null }
  | { readonly ok: false; readonly reason: string };

/**
 * Whether a drag may land, and what it would set.
 *
 * **Re-parenting, not reordering.** Siblings sort by name at every level, so a
 * drop has no position to express and the offset-based projection the dnd-kit
 * tree example uses would be machinery for an ordering this app does not
 * have. Dropping A onto B means "A belongs to B"; dropping onto nothing means
 * "A is top level".
 *
 * The rule worth having is the cycle guard. `buildCategoryForest` survives a
 * cycle — it promotes the stranded rows rather than losing them — but a tree
 * that a drag can corrupt should refuse the drag, not repair it afterwards.
 *
 * A drop that changes nothing is refused rather than applied: it keeps the
 * caller from reporting a move that did not happen, and from bumping
 * `updatedAt` for a gesture that landed where it started.
 */
export const planMove = <T extends TreeCategory>(
  categories: readonly T[],
  id: string,
  targetId: string | null,
): MovePlan => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const moving = byId.get(id);
  if (moving === undefined)
    return { ok: false, reason: "That category is gone." };
  if (targetId !== null && !byId.has(targetId)) {
    return { ok: false, reason: "That category is gone." };
  }
  if (targetId === id) {
    return { ok: false, reason: "A category cannot contain itself." };
  }
  if (moving.parentId === targetId) {
    return { ok: false, reason: "It is already there." };
  }

  // Walk up from the target: if we meet the dragged category, the drop is
  // inside its own subtree.
  const seen = new Set<string>();
  let cursor = targetId;
  while (cursor !== null && !seen.has(cursor)) {
    if (cursor === id) {
      return { ok: false, reason: "A category cannot go inside itself." };
    }
    seen.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }

  return { ok: true, id, parentId: targetId };
};

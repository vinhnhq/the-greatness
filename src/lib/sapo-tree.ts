/**
 * Reconstructing the category hierarchy that Sapo has nowhere to keep.
 *
 * **Why this file has to exist.** Sapo's collections are flat — there is no
 * parent field in the API, no column in the admin list, and no indentation in
 * the product form's picker. The three levels the storefront displays live
 * entirely in *menu config*, which is theme data. So a tree cannot be fetched;
 * it has to be reconstructed, and this is where.
 *
 * **Two independent sources, deliberately.**
 *
 * 1. **The menu markup gives root → mid.** Each mid-level anchor carries
 *    `data-target="<root-alias>-<own-alias>-menu"`, naming its parent
 *    outright. That is read here rather than inferred, and an anchor whose
 *    target names a root that does not exist is an error — a theme change
 *    should break a test, not seed a wrong tree.
 * 2. **Collection creation order gives mid → leaf.** The ids ascend in tree
 *    order: each mid-level was created, then its own leaves, then the next
 *    mid-level. Walking the id-ascending list therefore recovers the split.
 *
 * **The creation-order half is a one-time reconstruction and must be treated
 * as one.** It works only because these 211 collections were built in tree
 * order in one sitting. A category created tomorrow gets the highest id and
 * lands after every block, where a naive walk would file it under whichever
 * mid-level came last. `knownMaxSourceId` is how a caller says "anything newer
 * than this is not covered by the reconstruction" and gets it back as
 * `unfiled` instead of silently misfiled. Once seeded, the tree belongs to
 * this app: see the sync, which never writes `parentId`.
 *
 * Nothing here does I/O, so all of it is testable against a fixture.
 */

/** The subset of a Sapo collection this reconstruction needs. */
export type SapoCollectionRef = {
  readonly sourceId: number;
  readonly slug: string;
};

export type MenuLevels = {
  /** Top-level aliases, in the order the menu lists them. */
  readonly roots: readonly string[];
  /** Mid-level alias → its root alias, in menu order. */
  readonly parentOf: ReadonlyMap<string, string>;
};

const MENU_ANCHOR = "menu-popup";

/**
 * The menu block only. Everything after it — notably the site footer, which
 * repeats every root as a bare link — is out of scope, and an earlier
 * positional parser that missed this reported the roots a second time as
 * their own grandchildren.
 */
const menuBlock = (html: string): string => {
  const start = html.indexOf(`id="${MENU_ANCHOR}"`);
  if (start < 0) {
    throw new Error(
      `parseMenuLevels: no id="${MENU_ANCHOR}" block in the page — the theme's menu markup changed`,
    );
  }
  // The nav panels all live in `#main-menu-container`; the block ends where
  // that container's markup stops being panels. Anchoring on the container's
  // closing structure is brittle, so instead the reader is restricted to the
  // anchors it understands (`nav-link-1` / `nav-link-2`), which the footer
  // does not use. The slice below only bounds the search cheaply.
  return html.slice(start);
};

const ALIAS = String.raw`[a-z0-9-]+`;

/** `href="/alias"` or `href="/collections/alias"` — Sapo serves both. */
const hrefAlias = (attrs: string): string | null =>
  new RegExp(`href="/(?:collections/)?(${ALIAS})"`).exec(attrs)?.[1] ?? null;

const dataTarget = (attrs: string): string | null =>
  new RegExp(`data-target="(${ALIAS}-menu)"`).exec(attrs)?.[1] ?? null;

/**
 * Root and mid-level aliases, read from the menu's own anchors.
 *
 * `nav-link-1` marks a root, `nav-link-2` a mid-level. The mid-level's parent
 * comes from its `data-target`, which is `<root>-<own>-menu`; the root is
 * matched by prefix rather than by splitting on `-`, because both aliases
 * contain hyphens and there is no separator that could tell them apart.
 */
export const parseMenuLevels = (html: string): MenuLevels => {
  const block = menuBlock(html);
  const anchors = [...block.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1] ?? "");

  const roots: string[] = [];
  for (const attrs of anchors) {
    if (!/\bnav-link-1\b/.test(attrs)) continue;
    const alias = hrefAlias(attrs);
    if (alias && !roots.includes(alias)) roots.push(alias);
  }
  if (roots.length === 0) {
    throw new Error(
      `parseMenuLevels: found the ${MENU_ANCHOR} block but no nav-link-1 anchors in it`,
    );
  }

  const parentOf = new Map<string, string>();
  for (const attrs of anchors) {
    if (!/\bnav-link-2\b/.test(attrs)) continue;
    const alias = hrefAlias(attrs);
    if (!alias || parentOf.has(alias)) continue;
    const target = dataTarget(attrs);
    const root =
      target === null
        ? null
        : (roots.find((r) => target.startsWith(`${r}-`)) ?? null);
    if (root === null) {
      throw new Error(
        `parseMenuLevels: mid-level "${alias}" has data-target "${target ?? "(none)"}", which names no known root`,
      );
    }
    parentOf.set(alias, root);
  }

  return { roots, parentOf };
};

/**
 * Mid-level → its leaves, recovered from creation order.
 *
 * Walks the collections by ascending id. A root or a mid-level opens or closes
 * a run; anything else belongs to the mid-level currently open. A collection
 * that appears before any mid-level — the store's one standalone "featured"
 * collection does — closes the run and is left for the caller to treat as
 * unfiled.
 */
export const leavesByCreationOrder = (
  collections: readonly SapoCollectionRef[],
  levels: MenuLevels,
  options: { readonly knownMaxSourceId?: number } = {},
): ReadonlyMap<string, readonly string[]> => {
  const roots = new Set(levels.roots);
  const ceiling = options.knownMaxSourceId ?? Number.POSITIVE_INFINITY;
  const leaves = new Map<string, string[]>();

  let open: string | null = null;
  for (const c of [...collections].sort((a, b) => a.sourceId - b.sourceId)) {
    if (roots.has(c.slug)) {
      open = null;
      continue;
    }
    if (levels.parentOf.has(c.slug)) {
      open = c.slug;
      leaves.set(c.slug, []);
      continue;
    }
    // Past the reconstruction's horizon this ordering means nothing, so the
    // row is left unfiled rather than attached to the last open group.
    if (c.sourceId > ceiling) continue;
    if (open !== null) leaves.get(open)?.push(c.slug);
  }

  return leaves;
};

export type CategoryTree = {
  readonly roots: readonly string[];
  /** Every non-root alias → its parent alias. */
  readonly parents: Readonly<Record<string, string>>;
  /** Aliases the reconstruction could not place. Never guessed at. */
  readonly unfiled: readonly string[];
  readonly counts: {
    readonly roots: number;
    readonly mid: number;
    readonly leaves: number;
    readonly unfiled: number;
  };
};

/**
 * Both halves, reconciled — and the reconciliation is the point.
 *
 * Every collection must come out as exactly one of root, parented, or
 * unfiled. A menu that names a collection the catalogue does not have is a
 * mismatch between two sources that should agree, so it throws rather than
 * dropping the row: the artifact this produces is committed and reviewed, and
 * a silently short tree is worse than a failed script.
 */
export const buildCategoryTree = (
  collections: readonly SapoCollectionRef[],
  menuHtml: string,
  options: { readonly knownMaxSourceId?: number } = {},
): CategoryTree => {
  const levels = parseMenuLevels(menuHtml);
  const known = new Set(collections.map((c) => c.slug));

  for (const alias of [...levels.roots, ...levels.parentOf.keys()]) {
    if (!known.has(alias)) {
      throw new Error(
        `buildCategoryTree: the menu names "${alias}", which is not in the catalogue — the snapshot and the storefront disagree`,
      );
    }
  }

  const leaves = leavesByCreationOrder(collections, levels, options);

  const parents: Record<string, string> = {};
  for (const [mid, root] of levels.parentOf) parents[mid] = root;
  for (const [mid, own] of leaves) {
    for (const leaf of own) parents[leaf] = mid;
  }

  const placed = new Set([...levels.roots, ...Object.keys(parents)]);
  const unfiled = collections
    .filter((c) => !placed.has(c.slug))
    .map((c) => c.slug)
    .sort();

  return {
    roots: levels.roots,
    parents,
    unfiled,
    counts: {
      roots: levels.roots.length,
      mid: levels.parentOf.size,
      leaves: Object.keys(parents).length - levels.parentOf.size,
      unfiled: unfiled.length,
    },
  };
};

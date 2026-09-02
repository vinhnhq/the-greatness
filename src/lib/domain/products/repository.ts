/**
 * `ProductRepository` — the catalogue's reads and writes.
 *
 * `list()` is the interesting one. It carries search, a status filter, a
 * category filter, six sorts and offset paging, and it returns the total
 * alongside the rows because the pager needs both and two round-trips for one
 * screen is one too many. It also loads the media for the page's rows in
 * **one** follow-up query rather than per row — the thumbnail column is
 * exactly the shape that turns into an N+1 without anyone noticing until the
 * catalogue has a thousand rows.
 *
 * **A product links to media, it does not own it** (migration 004).
 * `setMedia` replaces the whole link set; removing an asset from a product
 * unlinks it and leaves it in the library, and deleting a product deletes no
 * files at all.
 *
 * Offset paging, not keyset: the UI offers "page 4 of 12", which keyset paging
 * cannot express, and the catalogue is thousands of rows rather than millions.
 * The spec's open question records when to revisit that.
 */

import { sql } from "kysely";

import { readContext } from "@/lib/context";
import { newId } from "@/lib/id";
import type { Currency } from "@/lib/money";
import {
  foldForSearch,
  productSearchText,
  searchPattern,
} from "@/lib/search-text";

import type { CategoryId } from "../categories/entity";
import type { MediaAsset, MediaId } from "../media/entity";
import { parseMediaAssetStrict } from "../media/entity";
import {
  parseProductStrict,
  type Product,
  type ProductId,
  type ProductStatus,
  type ProductWithRelations,
} from "./entity";
import { PAGE_SIZE, type ProductListQuery, UNCATEGORIZED } from "./list-query";

export type ProductInput = {
  readonly name: string;
  readonly slug: string;
  readonly sku: string | null;
  readonly description: string | null;
  readonly priceMinor: number;
  readonly currency: Currency;
  readonly status: ProductStatus;
};

export type ProductListRow = Product & {
  readonly media: readonly MediaAsset[];
  readonly categoryIds: readonly CategoryId[];
};

export type ProductPage = {
  readonly rows: readonly ProductListRow[];
  readonly total: number;
};

/**
 * The least a product needs to be a leaf in the taxonomy tree.
 *
 * Deliberately **no media**. The tree prefixes an icon the way an editor's
 * file tree does, not a thumbnail, so joining `product_media` here would
 * fetch 786 assets to render nothing — and the tree carries all 832 rows at
 * once, where `list()` carries a page.
 */
export type ProductTreeRow = {
  readonly id: ProductId;
  readonly name: string;
  readonly sku: string | null;
  readonly status: ProductStatus;
};

export type ProductRepository = {
  list(query: ProductListQuery): Promise<ProductPage>;
  /** Every product, four columns, for the taxonomy tree. */
  listForTree(): Promise<readonly ProductTreeRow[]>;
  getById(id: ProductId): Promise<ProductWithRelations | null>;
  getBySlug(slug: string): Promise<ProductWithRelations | null>;
  takenSlugs(exceptId?: ProductId): Promise<ReadonlySet<string>>;
  skuTaken(sku: string, exceptId?: ProductId): Promise<boolean>;
  create(input: ProductInput): Promise<Product>;
  update(id: ProductId, input: ProductInput): Promise<Product | null>;
  remove(id: ProductId): Promise<void>;
  /** Replace the whole set of links. The save form always sends the complete
   * selection, so a diff would be extra machinery over the same outcome. */
  setCategories(
    id: ProductId,
    categoryIds: readonly CategoryId[],
  ): Promise<void>;
  /**
   * Replace the whole ordered link set; array index becomes `position`, so
   * reordering in the UI needs no separate call.
   *
   * Takes **ids**, not rows: the assets already exist in the library by the
   * time a product is saved. Passing rows here is what would let a product
   * write a copy of an asset instead of linking to it.
   */
  setMedia(id: ProductId, mediaIds: readonly MediaId[]): Promise<void>;
};

type OrderSpec = {
  readonly column: "updatedAt" | "name" | "priceMinor";
  readonly dir: "asc" | "desc";
};

/** The only place a sort key becomes a column name. `list-query.ts` has
 * already narrowed the URL value to this union, so no caller-supplied string
 * can reach an ORDER BY. */
const ORDER: Record<ProductListQuery["sort"], OrderSpec> = {
  "updated-desc": { column: "updatedAt", dir: "desc" },
  "updated-asc": { column: "updatedAt", dir: "asc" },
  "name-asc": { column: "name", dir: "asc" },
  "name-desc": { column: "name", dir: "desc" },
  "price-asc": { column: "priceMinor", dir: "asc" },
  "price-desc": { column: "priceMinor", dir: "desc" },
};

export const dbProductRepo: ProductRepository = {
  list: async (query) => {
    const { db } = await readContext();

    // One builder feeds both the count and the page, so a filter can never be
    // applied to one and forgotten on the other — which surfaces as a pager
    // offering pages that render empty.
    const filtered = () => {
      let q = db.selectFrom("products");
      if (query.search !== "") {
        // Both sides are pre-folded to lowercase ASCII, so a plain LIKE
        // behaves identically on SQLite and Postgres — the dialect difference
        // is removed rather than branched on.
        q = q.where(
          sql<boolean>`${sql.ref("products.searchText")} like ${searchPattern(query.search)} escape ${sql.lit("\\")}`,
        );
      }
      if (query.status !== "all") q = q.where("status", "=", query.status);
      if (query.categoryId === UNCATEGORIZED) {
        // The 697. `not exists` rather than a left join with a null check:
        // a product in two categories would otherwise be counted twice by the
        // total query, which shares this builder.
        q = q.where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom("product_categories")
                .select("productId")
                .whereRef("product_categories.productId", "=", "products.id"),
            ),
          ),
        );
      } else if (query.categoryId) {
        const categoryId = query.categoryId as string;
        q = q.where((eb) =>
          eb.exists(
            eb
              .selectFrom("product_categories")
              .select("productId")
              .whereRef("product_categories.productId", "=", "products.id")
              .where("product_categories.categoryId", "=", categoryId),
          ),
        );
      }
      return q;
    };

    const totalRow = await filtered()
      .select((eb) => eb.fn.countAll<number>().as("n"))
      .executeTakeFirst();
    const total = Number(totalRow?.n ?? 0);

    const { column, dir } = ORDER[query.sort];
    const rows = await filtered()
      .selectAll()
      .orderBy(column, dir)
      // `id` is a uuid v7, so this tiebreaker is chronological rather than
      // arbitrary. Without it two products sharing a sort value can swap
      // places between page 1 and page 2, and one of them is never seen.
      .orderBy("id", "asc")
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE)
      .execute();

    const products = rows.map(parseProductStrict);
    const ids = products.map((p) => p.id as string);

    // Two queries for the page's relations, not two per row.
    const [mediaRows, linkRows] =
      ids.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .selectFrom("product_media")
              .innerJoin(
                "media_assets",
                "media_assets.id",
                "product_media.mediaId",
              )
              .selectAll("media_assets")
              .select("product_media.productId as linkedProductId")
              .where("product_media.productId", "in", ids)
              .orderBy("product_media.position", "asc")
              .execute(),
            db
              .selectFrom("product_categories")
              .selectAll()
              .where("productId", "in", ids)
              .execute(),
          ]);

    const mediaByProduct = new Map<string, MediaAsset[]>();
    for (const raw of mediaRows) {
      const asset = parseMediaAssetStrict(raw);
      const list = mediaByProduct.get(raw.linkedProductId) ?? [];
      list.push(asset);
      mediaByProduct.set(raw.linkedProductId, list);
    }

    const categoriesByProduct = new Map<string, CategoryId[]>();
    for (const link of linkRows) {
      const list = categoriesByProduct.get(link.productId) ?? [];
      list.push(link.categoryId as CategoryId);
      categoriesByProduct.set(link.productId, list);
    }

    return {
      total,
      rows: products.map((p) => ({
        ...p,
        media: mediaByProduct.get(p.id) ?? [],
        categoryIds: categoriesByProduct.get(p.id) ?? [],
      })),
    };
  },

  listForTree: async () => {
    const { db } = await readContext();
    const rows = await db
      .selectFrom("products")
      .select(["id", "name", "sku", "status"])
      .orderBy("name", "asc")
      .execute();
    // Rebuilt as plain objects for the same reason `listLinks` is: the driver
    // hands back null-prototype rows, and React refuses to serialise those to
    // a client component. It builds fine and throws on the request.
    return rows.map((r) => ({
      id: r.id as ProductId,
      name: r.name,
      sku: r.sku,
      status: r.status as ProductStatus,
    }));
  },

  getById: async (id) => loadOne("id", id),
  getBySlug: async (slug) => loadOne("slug", slug),

  takenSlugs: async (exceptId) => {
    const { db } = await readContext();
    let q = db.selectFrom("products").select("slug");
    if (exceptId) q = q.where("id", "!=", exceptId);
    const rows = await q.execute();
    return new Set(rows.map((r) => r.slug));
  },

  skuTaken: async (sku, exceptId) => {
    const { db } = await readContext();
    let q = db.selectFrom("products").select("id").where("sku", "=", sku);
    if (exceptId) q = q.where("id", "!=", exceptId);
    return (await q.executeTakeFirst()) !== undefined;
  },

  create: async (input) => {
    const { db } = await readContext();
    const now = new Date();
    const row = await db
      .insertInto("products")
      .values({
        id: newId(),
        ...input,
        searchText: productSearchText(input),
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseProductStrict(row);
  },

  update: async (id, input) => {
    const { db } = await readContext();
    const row = await db
      .updateTable("products")
      .set({
        ...input,
        searchText: productSearchText(input),
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    return row ? parseProductStrict(row) : null;
  },

  remove: async (id) => {
    const { db } = await readContext();
    // Links first, so an interrupted delete leaves orphaned links rather than
    // a product whose relations point at nothing. The **assets survive** —
    // they belong to the library, and another product may be using them.
    await db.deleteFrom("product_media").where("productId", "=", id).execute();
    await db
      .deleteFrom("product_categories")
      .where("productId", "=", id)
      .execute();
    await db.deleteFrom("products").where("id", "=", id).execute();
  },

  setCategories: async (id, categoryIds) => {
    const { db } = await readContext();
    await db
      .deleteFrom("product_categories")
      .where("productId", "=", id)
      .execute();
    // A product with no categories is legitimate; an empty INSERT is not.
    if (categoryIds.length === 0) return;
    await db
      .insertInto("product_categories")
      .values(
        [...new Set(categoryIds)].map((categoryId) => ({
          productId: id as string,
          categoryId: categoryId as string,
        })),
      )
      .execute();
  },

  setMedia: async (id, mediaIds) => {
    const { db } = await readContext();
    await db.deleteFrom("product_media").where("productId", "=", id).execute();
    if (mediaIds.length === 0) return;
    await db
      .insertInto("product_media")
      .values(
        // De-duplicated: the same asset twice in one gallery is not a
        // meaningful state, and the composite key would reject it anyway.
        [...new Set(mediaIds)].map((mediaId, index) => ({
          productId: id as string,
          mediaId: mediaId as string,
          position: index,
        })),
      )
      .execute();
  },
};

const loadOne = async (
  by: "id" | "slug",
  value: string,
): Promise<ProductWithRelations | null> => {
  const { db } = await readContext();
  const row = await db
    .selectFrom("products")
    .selectAll()
    .where(by, "=", value)
    .executeTakeFirst();
  if (!row) return null;

  const product = parseProductStrict(row);
  const [media, links] = await Promise.all([
    db
      .selectFrom("product_media")
      .innerJoin("media_assets", "media_assets.id", "product_media.mediaId")
      .selectAll("media_assets")
      .where("product_media.productId", "=", product.id as string)
      .orderBy("product_media.position", "asc")
      .execute(),
    db
      .selectFrom("product_categories")
      .select("categoryId")
      .where("productId", "=", product.id as string)
      .execute(),
  ]);

  return {
    ...product,
    media: media.map(parseMediaAssetStrict),
    categoryIds: links.map((l) => l.categoryId as CategoryId),
  };
};

// ---------------------------------------------------------------------
// In-memory twin
//
// Every filter, sort and page in `list()` is reimplemented here. That is
// duplication with a purpose: the unit tests run against this in
// milliseconds with no database, and where the two implementations disagree,
// the integration suite against the real driver is what catches it.
// ---------------------------------------------------------------------

export type SeededProduct = Product & {
  readonly categoryIds?: readonly CategoryId[];
  readonly media?: readonly MediaAsset[];
};

export const createInMemoryProductRepo = (
  now: () => Date = () => new Date(0),
): ProductRepository & {
  readonly seed: (rows: readonly SeededProduct[]) => void;
  readonly seedLibrary: (assets: readonly MediaAsset[]) => void;
} => {
  const products: Product[] = [];
  const categories = new Map<string, CategoryId[]>();
  /** productId → the asset ids it links to, in order. */
  const links = new Map<string, MediaId[]>();
  /** The library this twin resolves ids against. */
  const library = new Map<string, MediaAsset>();

  /** Resolve one product's link list against the library, in link order.
   * An id with no asset is dropped, matching the SQL side's INNER JOIN. */
  const mediaOf = (productId: string): readonly MediaAsset[] =>
    (links.get(productId) ?? []).flatMap((id) => {
      const asset = library.get(id);
      return asset ? [asset] : [];
    });

  const matches = (p: Product, query: ProductListQuery): boolean => {
    if (query.status !== "all" && p.status !== query.status) return false;
    if (query.categoryId === UNCATEGORIZED) {
      if ((categories.get(p.id) ?? []).length > 0) return false;
    } else if (query.categoryId) {
      const links = categories.get(p.id) ?? [];
      if (!links.includes(query.categoryId)) return false;
    }
    if (query.search !== "") {
      // Same fold as the SQL side, so the twin cannot disagree about
      // diacritics or case.
      if (!productSearchText(p).includes(foldForSearch(query.search))) {
        return false;
      }
    }
    return true;
  };

  const compare = (
    a: Product,
    b: Product,
    sort: ProductListQuery["sort"],
  ): number => {
    const { column, dir } = ORDER[sort];
    const sign = dir === "asc" ? 1 : -1;
    const primary =
      column === "name"
        ? a.name.localeCompare(b.name)
        : column === "priceMinor"
          ? a.priceMinor - b.priceMinor
          : a.updatedAt.getTime() - b.updatedAt.getTime();
    // Same tiebreaker as the SQL, for the same reason.
    return primary !== 0 ? primary * sign : a.id.localeCompare(b.id);
  };

  const repo: ProductRepository = {
    list: async (query) => {
      const all = products.filter((p) => matches(p, query));
      const sorted = [...all].sort((a, b) => compare(a, b, query.sort));
      const start = (query.page - 1) * PAGE_SIZE;
      return {
        total: all.length,
        rows: sorted.slice(start, start + PAGE_SIZE).map((p) => ({
          ...p,
          media: mediaOf(p.id),
          categoryIds: categories.get(p.id) ?? [],
        })),
      };
    },

    listForTree: async () =>
      [...products]
        .sort((a, b) => a.name.localeCompare(b.name, "vi"))
        .map((p) => ({ id: p.id, name: p.name, sku: p.sku, status: p.status })),

    getById: async (id) => {
      const p = products.find((r) => r.id === id);
      return p
        ? {
            ...p,
            media: mediaOf(p.id),
            categoryIds: categories.get(p.id) ?? [],
          }
        : null;
    },

    getBySlug: async (slug) => {
      const p = products.find((r) => r.slug === slug);
      return p ? repo.getById(p.id) : null;
    },

    takenSlugs: async (exceptId) =>
      new Set(products.filter((p) => p.id !== exceptId).map((p) => p.slug)),

    skuTaken: async (sku, exceptId) =>
      products.some((p) => p.sku === sku && p.id !== exceptId),

    create: async (input) => {
      const stamp = now();
      const row: Product = {
        ...input,
        id: newId() as ProductId,
        // Not part of `ProductInput`: a row created through the repository was
        // created here, not imported. Only the seed sets it, by id.
        sapoId: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      products.push(row);
      return row;
    },

    update: async (id, input) => {
      const index = products.findIndex((p) => p.id === id);
      if (index === -1) return null;
      products[index] = { ...products[index], ...input, updatedAt: now() };
      return products[index];
    },

    remove: async (id) => {
      const index = products.findIndex((p) => p.id === id);
      if (index !== -1) products.splice(index, 1);
      categories.delete(id);
      // The links go; the library does not. Same as the SQL side.
      links.delete(id);
    },

    setCategories: async (id, categoryIds) => {
      categories.set(id, [...new Set(categoryIds)]);
    },

    setMedia: async (id, mediaIds) => {
      links.set(id, [...new Set(mediaIds)]);
    },
  };

  return {
    ...repo,
    seed: (rows) => {
      for (const row of rows) {
        const { categoryIds, media, ...product } = row;
        products.push(product);
        if (categoryIds) categories.set(product.id, [...categoryIds]);
        if (media) {
          for (const asset of media) library.set(asset.id, asset);
          links.set(
            product.id,
            media.map((a) => a.id),
          );
        }
      }
    },
    /** Put assets in the twin's library so `setMedia` has something to
     * resolve. The real repository resolves against `media_assets`. */
    seedLibrary: (assets) => {
      for (const asset of assets) library.set(asset.id, asset);
    },
  };
};

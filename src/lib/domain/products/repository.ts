/**
 * `ProductRepository` — the catalogue's reads and writes.
 *
 * `list()` is the interesting one. It carries search, a status filter, a
 * category filter, six sorts and offset paging, and it returns the total
 * alongside the rows because the pager needs both and two round-trips for one
 * screen is one too many. It also loads the attachments for the page's rows in
 * **one** follow-up query rather than per row — the thumbnail column is
 * exactly the shape that turns into an N+1 without anyone noticing until the
 * catalogue has a thousand rows.
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
import {
  type Attachment,
  type AttachmentId,
  parseAttachmentStrict,
  parseProductStrict,
  type Product,
  type ProductId,
  type ProductStatus,
  type ProductWithRelations,
} from "./entity";
import { PAGE_SIZE, type ProductListQuery } from "./list-query";

/** One attachment as the save action supplies it — the row minus the things
 * the repository mints (`id`, `productId`, `position`, `createdAt`). */
export type NewAttachment = {
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
  readonly alt: string | null;
};

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
  readonly attachments: readonly Attachment[];
  readonly categoryIds: readonly CategoryId[];
};

export type ProductPage = {
  readonly rows: readonly ProductListRow[];
  readonly total: number;
};

export type ProductRepository = {
  list(query: ProductListQuery): Promise<ProductPage>;
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
  /** Replace the whole ordered attachment list; array index becomes
   * `position`, so reordering in the UI needs no separate call. */
  setAttachments(
    id: ProductId,
    attachments: readonly NewAttachment[],
  ): Promise<void>;
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
      if (query.categoryId) {
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
    const [attachmentRows, linkRows] =
      ids.length === 0
        ? [[], []]
        : await Promise.all([
            db
              .selectFrom("product_attachments")
              .selectAll()
              .where("productId", "in", ids)
              .orderBy("position", "asc")
              .execute(),
            db
              .selectFrom("product_categories")
              .selectAll()
              .where("productId", "in", ids)
              .execute(),
          ]);

    const attachmentsByProduct = new Map<string, Attachment[]>();
    for (const raw of attachmentRows) {
      const attachment = parseAttachmentStrict(raw);
      const list = attachmentsByProduct.get(attachment.productId) ?? [];
      list.push(attachment);
      attachmentsByProduct.set(attachment.productId, list);
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
        attachments: attachmentsByProduct.get(p.id) ?? [],
        categoryIds: categoriesByProduct.get(p.id) ?? [],
      })),
    };
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
    // Children first, so an interrupted delete leaves orphaned child rows
    // rather than a product whose relations point at nothing.
    await db
      .deleteFrom("product_attachments")
      .where("productId", "=", id)
      .execute();
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

  setAttachments: async (id, attachments) => {
    const { db } = await readContext();
    await db
      .deleteFrom("product_attachments")
      .where("productId", "=", id)
      .execute();
    if (attachments.length === 0) return;
    const now = new Date();
    await db
      .insertInto("product_attachments")
      .values(
        attachments.map((a, index) => ({
          id: newId(),
          productId: id as string,
          ...a,
          position: index,
          createdAt: now,
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
  const [attachments, links] = await Promise.all([
    db
      .selectFrom("product_attachments")
      .selectAll()
      .where("productId", "=", product.id as string)
      .orderBy("position", "asc")
      .execute(),
    db
      .selectFrom("product_categories")
      .select("categoryId")
      .where("productId", "=", product.id as string)
      .execute(),
  ]);

  return {
    ...product,
    attachments: attachments.map(parseAttachmentStrict),
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
  readonly attachments?: readonly Attachment[];
};

export const createInMemoryProductRepo = (
  now: () => Date = () => new Date(0),
): ProductRepository & {
  readonly seed: (rows: readonly SeededProduct[]) => void;
} => {
  const products: Product[] = [];
  const categories = new Map<string, CategoryId[]>();
  const attachments = new Map<string, Attachment[]>();

  const matches = (p: Product, query: ProductListQuery): boolean => {
    if (query.status !== "all" && p.status !== query.status) return false;
    if (query.categoryId) {
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
          attachments: attachments.get(p.id) ?? [],
          categoryIds: categories.get(p.id) ?? [],
        })),
      };
    },

    getById: async (id) => {
      const p = products.find((r) => r.id === id);
      return p
        ? {
            ...p,
            attachments: attachments.get(p.id) ?? [],
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
      attachments.delete(id);
    },

    setCategories: async (id, categoryIds) => {
      categories.set(id, [...new Set(categoryIds)]);
    },

    setAttachments: async (id, list) => {
      attachments.set(
        id,
        list.map((a, index) => ({
          ...a,
          id: newId() as AttachmentId,
          productId: id,
          position: index,
          createdAt: now(),
        })),
      );
    },
  };

  return {
    ...repo,
    seed: (rows) => {
      for (const row of rows) {
        const { categoryIds, attachments: seededAttachments, ...product } = row;
        products.push(product);
        if (categoryIds) categories.set(product.id, [...categoryIds]);
        if (seededAttachments) {
          attachments.set(product.id, [...seededAttachments]);
        }
      }
    },
  };
};

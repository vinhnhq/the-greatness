/**
 * `CategoryRepository` — plain CRUD plus the product counts the categories
 * page shows.
 *
 * `dbCategoryRepo` reads the connection from `readContext()`, so it uses the
 * transaction when one is open and the shared connection otherwise, without
 * anything being passed to it.
 */

import { readContext } from "@/lib/context";
import { newId } from "@/lib/id";

import { type Category, type CategoryId, parseCategoryStrict } from "./entity";

export type NewCategory = {
  readonly name: string;
  readonly slug: string;
  readonly parentId?: CategoryId | null;
};

export type CategoryWithCount = Category & {
  readonly productCount: number;
};

/** One row per link, for the subtree counts the tree view shows. */
export type CategoryProductLink = {
  readonly categoryId: string;
  readonly productId: string;
};

export type CategoryRepository = {
  list(): Promise<readonly Category[]>;
  /** The categories page's one read: every category with how many products
   * link to it, in a single query rather than N+1 counts. */
  listWithCounts(): Promise<readonly CategoryWithCount[]>;
  getById(id: CategoryId): Promise<Category | null>;
  /** By slug — how the drill-down route addresses a category. */
  getBySlug(slug: string): Promise<Category | null>;
  /**
   * Every product↔category link, for the tree view's subtree counts.
   *
   * A product can be linked to a parent *and* to its child, so those counts
   * have to be distinct rather than summed, and that cannot be done from
   * per-category totals alone. 280 rows today, proportional to
   * categorisations rather than to the catalogue.
   */
  listLinks(): Promise<readonly CategoryProductLink[]>;
  /** Every slug in use — the input `uniqueSlug()` needs. */
  takenSlugs(exceptId?: CategoryId): Promise<ReadonlySet<string>>;
  create(input: NewCategory): Promise<Category>;
  rename(id: CategoryId, name: string, slug: string): Promise<Category | null>;
  /** Removes the category and every link to it; products are untouched. */
  remove(id: CategoryId): Promise<void>;
};

export const dbCategoryRepo: CategoryRepository = {
  list: async () => {
    const { db } = await readContext();
    const rows = await db
      .selectFrom("categories")
      .selectAll()
      .orderBy("name", "asc")
      .execute();
    return rows.map(parseCategoryStrict);
  },

  listWithCounts: async () => {
    const { db } = await readContext();
    const rows = await db
      .selectFrom("categories")
      .selectAll("categories")
      .select((eb) =>
        eb
          .selectFrom("product_categories")
          .whereRef("product_categories.categoryId", "=", "categories.id")
          .select(({ fn }) => fn.countAll<number>().as("n"))
          .as("productCount"),
      )
      .orderBy("categories.name", "asc")
      .execute();
    return rows.map((row) => ({
      ...parseCategoryStrict(row),
      productCount: Number(row.productCount ?? 0),
    }));
  },

  listLinks: async () => {
    const { db } = await readContext();
    const rows = await db
      .selectFrom("product_categories")
      .select(["categoryId", "productId"])
      .execute();
    // Rebuilt as plain objects, not passed through. The driver hands back rows
    // with a null prototype, and React refuses to serialise those across the
    // server/client boundary — "Only plain objects … can be passed to Client
    // Components". It builds fine and fails on the request.
    return rows.map((r) => ({
      categoryId: r.categoryId,
      productId: r.productId,
    }));
  },

  getById: async (id) => {
    const { db } = await readContext();
    const row = await db
      .selectFrom("categories")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return row ? parseCategoryStrict(row) : null;
  },

  getBySlug: async (slug) => {
    const { db } = await readContext();
    const row = await db
      .selectFrom("categories")
      .selectAll()
      .where("slug", "=", slug)
      .executeTakeFirst();
    return row ? parseCategoryStrict(row) : null;
  },

  takenSlugs: async (exceptId) => {
    const { db } = await readContext();
    let q = db.selectFrom("categories").select("slug");
    if (exceptId) q = q.where("id", "!=", exceptId);
    const rows = await q.execute();
    return new Set(rows.map((r) => r.slug));
  },

  create: async (input) => {
    const { db } = await readContext();
    const now = new Date();
    const row = await db
      .insertInto("categories")
      .values({
        id: newId(),
        name: input.name,
        slug: input.slug,
        parentId: input.parentId ?? null,
        sapoId: null,
        createdAt: now,
        updatedAt: now,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return parseCategoryStrict(row);
  },

  rename: async (id, name, slug) => {
    const { db } = await readContext();
    const row = await db
      .updateTable("categories")
      .set({ name, slug, updatedAt: new Date() })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    return row ? parseCategoryStrict(row) : null;
  },

  remove: async (id) => {
    const { db } = await readContext();
    // Links first: a category with no row but surviving links would filter to
    // an empty list forever, with nothing in the UI able to name the cause.
    await db
      .deleteFrom("product_categories")
      .where("categoryId", "=", id)
      .execute();
    await db.deleteFrom("categories").where("id", "=", id).execute();
  },
};

/** Array-backed twin for unit tests. One instance per test; `now` is
 * injectable so a test can control ordering. */
export const createInMemoryCategoryRepo = (
  now: () => Date = () => new Date(0),
): CategoryRepository & {
  readonly seed: (rows: readonly Category[]) => void;
  readonly links: Map<string, Set<string>>;
} => {
  const rows: Category[] = [];
  /** categoryId → productIds */
  const links = new Map<string, Set<string>>();

  const repo: CategoryRepository = {
    list: async () => [...rows].sort((a, b) => a.name.localeCompare(b.name)),

    listWithCounts: async () =>
      [...rows]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ ...c, productCount: links.get(c.id)?.size ?? 0 })),

    listLinks: async () =>
      [...links].flatMap(([categoryId, productIds]) =>
        [...productIds].map((productId) => ({ categoryId, productId })),
      ),

    getById: async (id) => rows.find((r) => r.id === id) ?? null,

    getBySlug: async (slug) => rows.find((r) => r.slug === slug) ?? null,

    takenSlugs: async (exceptId) =>
      new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.slug)),

    create: async (input) => {
      const stamp = now();
      const row: Category = {
        id: newId() as CategoryId,
        name: input.name,
        slug: input.slug,
        parentId: input.parentId ?? null,
        // Not part of the input: a category created through the repository was
        // created here, not imported. Only the seed sets it, by id.
        sapoId: null,
        createdAt: stamp,
        updatedAt: stamp,
      };
      rows.push(row);
      return row;
    },

    rename: async (id, name, slug) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index === -1) return null;
      rows[index] = { ...rows[index], name, slug, updatedAt: now() };
      return rows[index];
    },

    remove: async (id) => {
      const index = rows.findIndex((r) => r.id === id);
      if (index !== -1) rows.splice(index, 1);
      links.delete(id);
    },
  };

  return {
    ...repo,
    links,
    seed: (seeded) => {
      rows.push(...seeded);
    },
  };
};

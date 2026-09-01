/**
 * Refresh the catalogue from the Sapo snapshot **without destroying anything
 * local**. The counterpart to `seed-sapo.ts`, and deliberately not it.
 *
 * `bun run seed` empties five tables and reinserts them. That is correct for
 * seeding a fresh database and catastrophic as a recurring job: it would drop
 * the reconstructed category tree, every media link and every operator edit,
 * every run. This reconciles instead — `lib/domain/sync-plan.ts` decides what
 * would change, and this applies it.
 *
 * ## What is whose
 *
 * **Sapo owns** a product's name, slug, SKU, description, price and status,
 * a category's name and slug, and which categories a product is in. Those are
 * fetched and overwritten.
 *
 * **This app owns** `categories.parentId` — the tree, which Sapo has nowhere
 * to store — and everything media. Neither is ever written here. The tree in
 * particular is reconstructed once (see `lib/sapo-tree.ts`) and owned from
 * then on; creation order is not a stable ongoing derivation, so a sync that
 * rewrote `parentId` would silently reshape the catalogue on a schedule.
 *
 * **A category Sapo added since the reconstruction arrives unfiled** — a null
 * parent — rather than being guessed into a group. It shows at the top level
 * of `/categories` for someone to place.
 *
 * ## What it will not do
 *
 * **Nothing is deleted.** A row whose Sapo counterpart has gone is reported,
 * not removed: a product pulled from the storefront for an afternoon must not
 * take its media links and its categorisation with it. Acting on that list is
 * a person's decision.
 *
 * **A link to a locally-created category survives.** Reconciling memberships
 * to match Sapo would otherwise erase categorisation done here, which is the
 * whole point of the tree work; only links to imported categories are
 * Sapo's to reconcile.
 *
 * Usage: `bun run sync:sapo` — run `bun run fetch:sapo` first for fresh data.
 */

import type { Kysely } from "kysely";

import type { DB } from "@/lib/db-types";
import { planSync } from "@/lib/domain/sync-plan";
import { newId } from "@/lib/id";
import { productSearchText } from "@/lib/search-text";

import { htmlToText } from "./seed-sapo";

const CHUNK = 100;

const chunked = <T>(rows: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK)
    out.push(rows.slice(i, i + CHUNK));
  return out;
};

const clamp = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;

export type SapoCategory = { sourceId: number; name: string; slug: string };
export type SapoProduct = {
  sourceId: number;
  name: string;
  slug: string;
  sku: string | null;
  descriptionHtml: string | null;
  priceMinor: number | null;
  variants: readonly { sku: string | null }[];
};
export type SapoLink = { categorySourceId: number; productSourceId: number };

/**
 * The snapshot, passed in rather than read here.
 *
 * The file reading lives in `scripts/sync-sapo.ts` so this function is a pure
 * function of (database, snapshot) and can be driven from a test with four
 * rows instead of 832.
 */
export type SapoSnapshot = {
  readonly categories: readonly SapoCategory[];
  readonly products: readonly SapoProduct[];
  readonly links: readonly SapoLink[];
};

export type SyncReport = {
  readonly categories: {
    added: number;
    updated: number;
    unchanged: number;
    vanished: readonly string[];
    unfiled: readonly string[];
  };
  readonly products: {
    added: number;
    updated: number;
    unchanged: number;
    vanished: readonly string[];
  };
  readonly links: { added: number; removed: number; keptLocal: number };
};

export const syncFromSapo = async (
  db: Kysely<DB>,
  snapshot: SapoSnapshot,
): Promise<SyncReport> => {
  const { categories, products, links } = snapshot;
  const now = new Date();

  // --- categories --------------------------------------------------------
  const localCategories = await db
    .selectFrom("categories")
    .select(["id", "sapoId", "name", "slug", "parentId"])
    .execute();

  const categoryPlan = planSync(
    localCategories,
    categories.map((c) => ({
      sapoId: String(c.sourceId),
      name: clamp(c.name, 60),
      slug: c.slug,
    })),
    // Name and slug only. `parentId` is ours and is not in this object, which
    // is what makes it impossible for a sync to move a category.
    (l, r) =>
      l.name === r.name && l.slug === r.slug
        ? null
        : { name: r.name, slug: r.slug },
  );

  const newCategoryRows = categoryPlan.insert.map((c) => ({
    id: newId(),
    name: c.name,
    slug: c.slug,
    // Unfiled. A category created after the reconstruction has an id past
    // every block, so its position cannot be inferred — see `sapo-tree.ts`.
    parentId: null,
    sapoId: c.sapoId,
    createdAt: now,
    updatedAt: now,
  }));
  for (const rows of chunked(newCategoryRows)) {
    await db.insertInto("categories").values(rows).execute();
  }
  for (const u of categoryPlan.update) {
    await db
      .updateTable("categories")
      .set({ ...u.changes, updatedAt: now })
      .where("id", "=", u.id)
      .execute();
  }

  // --- products ----------------------------------------------------------
  const localProducts = await db
    .selectFrom("products")
    .select([
      "id",
      "sapoId",
      "name",
      "slug",
      "sku",
      "description",
      "priceMinor",
    ])
    .execute();

  const remoteProducts = products.map((p) => {
    const description = p.descriptionHtml
      ? clamp(htmlToText(p.descriptionHtml), 20000)
      : null;
    return {
      sapoId: String(p.sourceId),
      name: clamp(p.name, 200),
      slug: p.slug,
      sku: p.sku ?? p.variants[0]?.sku ?? null,
      description,
      priceMinor: p.priceMinor ?? 0,
    };
  });

  const productPlan = planSync(localProducts, remoteProducts, (l, r) =>
    l.name === r.name &&
    l.slug === r.slug &&
    l.sku === r.sku &&
    l.description === r.description &&
    l.priceMinor === r.priceMinor
      ? null
      : {
          name: r.name,
          slug: r.slug,
          sku: r.sku,
          description: r.description,
          priceMinor: r.priceMinor,
        },
  );

  const newProductRows = productPlan.insert.map((p) => ({
    id: newId(),
    name: p.name,
    slug: p.slug,
    sku: p.sku,
    description: p.description,
    priceMinor: p.priceMinor,
    currency: "VND",
    status: "active",
    searchText: productSearchText(p),
    sapoId: p.sapoId,
    createdAt: now,
    updatedAt: now,
  }));
  for (const rows of chunked(newProductRows)) {
    await db.insertInto("products").values(rows).execute();
  }
  for (const u of productPlan.update) {
    // `searchText` is derived, never fetched — recomputed with the same
    // function the repository uses so the twin cannot drift.
    const changes = u.changes as {
      name: string;
      sku: string | null;
      description: string | null;
    };
    await db
      .updateTable("products")
      .set({
        ...u.changes,
        searchText: productSearchText(changes),
        updatedAt: now,
      })
      .where("id", "=", u.id)
      .execute();
  }

  // --- memberships -------------------------------------------------------
  const categoryBySapo = new Map(
    (
      await db
        .selectFrom("categories")
        .select(["id", "sapoId"])
        .where("sapoId", "is not", null)
        .execute()
    ).map((c) => [c.sapoId!, c.id]),
  );
  const productBySapo = new Map(
    (
      await db
        .selectFrom("products")
        .select(["id", "sapoId"])
        .where("sapoId", "is not", null)
        .execute()
    ).map((p) => [p.sapoId!, p.id]),
  );
  const importedCategoryIds = new Set(categoryBySapo.values());

  const wanted = new Set<string>();
  for (const l of links) {
    const categoryId = categoryBySapo.get(String(l.categorySourceId));
    const productId = productBySapo.get(String(l.productSourceId));
    if (categoryId && productId) wanted.add(`${productId} ${categoryId}`);
  }

  const existing = await db
    .selectFrom("product_categories")
    .select(["productId", "categoryId"])
    .execute();

  // A link to a category created here is not Sapo's to remove — erasing it
  // would undo exactly the categorisation this app exists to make possible.
  const keptLocal = existing.filter(
    (e) => !importedCategoryIds.has(e.categoryId),
  ).length;

  const toRemove = existing.filter(
    (e) =>
      importedCategoryIds.has(e.categoryId) &&
      !wanted.has(`${e.productId} ${e.categoryId}`),
  );
  const have = new Set(existing.map((e) => `${e.productId} ${e.categoryId}`));
  const toAdd = [...wanted].filter((key) => !have.has(key));

  for (const r of toRemove) {
    await db
      .deleteFrom("product_categories")
      .where("productId", "=", r.productId)
      .where("categoryId", "=", r.categoryId)
      .execute();
  }
  const addRows = toAdd.map((key) => {
    const [productId, categoryId] = key.split(" ");
    return { productId: productId!, categoryId: categoryId! };
  });
  for (const rows of chunked(addRows)) {
    await db.insertInto("product_categories").values(rows).execute();
  }

  return {
    categories: {
      added: categoryPlan.insert.length,
      updated: categoryPlan.update.length,
      unchanged: categoryPlan.unchanged,
      vanished: categoryPlan.vanished.map((v) => v.name),
      unfiled: newCategoryRows.map((r) => r.name),
    },
    products: {
      added: productPlan.insert.length,
      updated: productPlan.update.length,
      unchanged: productPlan.unchanged,
      vanished: productPlan.vanished.map((v) => v.name),
    },
    links: { added: addRows.length, removed: toRemove.length, keptLocal },
  };
};

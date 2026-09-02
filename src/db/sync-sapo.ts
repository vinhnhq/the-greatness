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
 * ## Three-way, since v6
 *
 * The sync no longer overwrites. `sapo_mirror` holds the payload Sapo gave us
 * last time, so every field is merged as base/ours/theirs (`lib/domain/merge`)
 * and the branch that did not exist — **we changed it and Sapo did not, so
 * keep ours** — now does. A field both sides moved is parked in
 * `sync_conflicts` and written nowhere: the run applies the three automatic
 * buckets and never blocks on a person, which is what keeps it schedulable.
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
import { mergeRow, mergeSet } from "@/lib/domain/merge";
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
    /** Rows we edited that Sapo did not — left alone. The v6 branch. */
    keptOurs: number;
    unchanged: number;
    vanished: readonly string[];
    unfiled: readonly string[];
  };
  readonly products: {
    added: number;
    updated: number;
    keptOurs: number;
    unchanged: number;
    vanished: readonly string[];
  };
  readonly links: { added: number; removed: number; keptLocal: number };
  readonly conflicts: {
    /** Newly parked this run. */
    opened: number;
    /** Parked earlier, gone now because the two sides agree again. */
    healed: number;
    /** Still awaiting a person. */
    open: number;
  };
};

export const syncFromSapo = async (
  db: Kysely<DB>,
  snapshot: SapoSnapshot,
): Promise<SyncReport> => {
  const { categories, products, links } = snapshot;
  const now = new Date();

  // The base of every merge: what Sapo said last time. A row with no entry
  // here has never been mirrored, and `mergeField` adopts rather than
  // manufacturing a conflict — see migration 006 on why there is no backfill.
  const mirrorRows = await db
    .selectFrom("sapo_mirror")
    .select(["entity", "sapoId", "payload"])
    .execute();
  const mirror = new Map(
    mirrorRows.map((m) => [
      `${m.entity}:${m.sapoId}`,
      JSON.parse(m.payload) as Record<string, unknown>,
    ]),
  );
  const baseFor = (
    entity: string,
    sapoId: string,
  ): Record<string, unknown> | undefined => mirror.get(`${entity}:${sapoId}`);

  /**
   * The base for a conflicted field must NOT advance.
   *
   * Writing Sapo's new value into the mirror while the conflict is still open
   * would make the next run see "ours moved, theirs did not" — keep-ours —
   * and the parked decision would quietly resolve itself in our favour one
   * run later. The mirror records what has been *reconciled*, so a field
   * still in dispute keeps the base it had.
   */
  const holdBase = <T extends Record<string, unknown>>(
    entity: string,
    sapoId: string,
    payload: T,
    conflictedFields: readonly string[],
  ): T => {
    if (conflictedFields.length === 0) return payload;
    const previous = baseFor(entity, sapoId);
    if (previous === undefined) return payload;
    const held = { ...payload } as Record<string, unknown>;
    for (const f of conflictedFields) {
      if (f in previous) held[f] = previous[f];
    }
    return held as T;
  };

  /** Payloads to write back after applying, so the next run has a base. */
  const nextMirror: {
    entity: string;
    sapoId: string;
    payload: Record<string, unknown>;
  }[] = [];
  const openedConflicts: {
    entity: string;
    sapoId: string;
    field: string;
    base: unknown;
    ours: unknown;
    theirs: unknown;
  }[] = [];

  // --- categories --------------------------------------------------------
  const localCategories = await db
    .selectFrom("categories")
    .select(["id", "sapoId", "name", "slug", "parentId"])
    .execute();

  let categoryKeptOurs = 0;
  const categoryPlan = planSync(
    localCategories,
    categories.map((c) => ({
      sapoId: String(c.sourceId),
      name: clamp(c.name, 60),
      slug: c.slug,
    })),
    // Three-way now. `parentId` is still absent from every object here, which
    // is what makes it structurally impossible for a sync to move a category.
    (l, r) => {
      const merged = mergeRow(
        ["name", "slug"],
        baseFor("category", r.sapoId),
        { name: l.name, slug: l.slug },
        { name: r.name, slug: r.slug },
      );
      for (const c of merged.conflicts) {
        openedConflicts.push({
          entity: "category",
          sapoId: r.sapoId,
          field: c.field,
          base: c.base,
          ours: c.ours,
          theirs: c.theirs,
        });
      }
      if (merged.keptOurs) categoryKeptOurs++;
      nextMirror.push({
        entity: "category",
        sapoId: r.sapoId,
        payload: holdBase(
          "category",
          r.sapoId,
          { name: r.name, slug: r.slug },
          merged.conflicts.map((c) => c.field),
        ),
      });
      return merged.changed ? merged.merged : null;
    },
  );

  const newCategoryRows = categoryPlan.insert.map((c) => ({
    id: newId(),
    name: c.name,
    slug: c.slug,
    // Unfiled. A category created after the tree reconstruction has an id
    // past every block, so its position cannot be inferred.
    parentId: null,
    sapoId: c.sapoId,
    createdAt: now,
    updatedAt: now,
  }));
  for (const rows of chunked(newCategoryRows)) {
    await db.insertInto("categories").values(rows).execute();
  }
  for (const c of categoryPlan.insert) {
    nextMirror.push({
      entity: "category",
      sapoId: c.sapoId,
      payload: { name: c.name, slug: c.slug },
    });
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

  // Sapo's view of a product's memberships, keyed by product sapoId, so the
  // mirror can carry them and `mergeSet` can merge them per member.
  const theirCategoriesOf = new Map<string, Set<string>>();
  for (const l of links) {
    const key = String(l.productSourceId);
    const set = theirCategoriesOf.get(key) ?? new Set<string>();
    set.add(String(l.categorySourceId));
    theirCategoriesOf.set(key, set);
  }

  const PRODUCT_FIELDS = [
    "name",
    "slug",
    "sku",
    "description",
    "priceMinor",
  ] as const;

  let productKeptOurs = 0;
  const productPlan = planSync(localProducts, remoteProducts, (l, r) => {
    const merged = mergeRow(
      PRODUCT_FIELDS,
      baseFor("product", r.sapoId),
      {
        name: l.name,
        slug: l.slug,
        sku: l.sku,
        description: l.description,
        priceMinor: l.priceMinor,
      },
      {
        name: r.name,
        slug: r.slug,
        sku: r.sku,
        description: r.description,
        priceMinor: r.priceMinor,
      },
    );
    for (const c of merged.conflicts) {
      openedConflicts.push({
        entity: "product",
        sapoId: r.sapoId,
        field: c.field,
        base: c.base,
        ours: c.ours,
        theirs: c.theirs,
      });
    }
    if (merged.keptOurs) productKeptOurs++;
    nextMirror.push({
      entity: "product",
      sapoId: r.sapoId,
      payload: holdBase(
        "product",
        r.sapoId,
        {
          name: r.name,
          slug: r.slug,
          sku: r.sku,
          description: r.description,
          priceMinor: r.priceMinor,
          categories: [...(theirCategoriesOf.get(r.sapoId) ?? [])].sort(),
        },
        merged.conflicts.map((c) => c.field),
      ),
    });
    return merged.changed ? merged.merged : null;
  });

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

  // Memberships, merged per member rather than overwritten.
  //
  // This is the case the whole version exists for. A product dragged into a
  // category is an addition we made and Sapo did not; the old code recomputed
  // the link set from Sapo and deleted it. With a base, "we added X, they
  // removed Y" is two independent facts — see `mergeSet`.
  const existing = await db
    .selectFrom("product_categories")
    .select(["productId", "categoryId"])
    .execute();
  const oursByProduct = new Map<string, Set<string>>();
  for (const e of existing) {
    const set = oursByProduct.get(e.productId) ?? new Set<string>();
    set.add(e.categoryId);
    oursByProduct.set(e.productId, set);
  }

  const sapoIdOfCategory = new Map(
    [...categoryBySapo].map(([s, id]) => [id, s]),
  );
  const localIdOfCategory = categoryBySapo;

  let linksAdded = 0;
  let linksRemoved = 0;
  let keptLocal = 0;

  for (const [productSapoId, productId] of productBySapo) {
    const ourLocal = oursByProduct.get(productId) ?? new Set<string>();
    // Compare in Sapo's namespace; a locally-created category has no sapoId
    // and is therefore never Sapo's to remove.
    const ourSapo = new Set<string>();
    for (const localId of ourLocal) {
      const sid = sapoIdOfCategory.get(localId);
      if (sid === undefined) keptLocal++;
      else ourSapo.add(sid);
    }

    const base = baseFor("product", productSapoId)?.["categories"] as
      | string[]
      | undefined;
    const theirs = theirCategoriesOf.get(productSapoId) ?? new Set<string>();

    const merged = mergeSet(
      base === undefined ? undefined : new Set(base),
      ourSapo,
      theirs,
    );

    for (const sid of merged.value) {
      if (ourSapo.has(sid)) continue;
      const categoryId = localIdOfCategory.get(sid);
      if (categoryId === undefined) continue;
      await db
        .insertInto("product_categories")
        .values({ productId, categoryId })
        .execute();
      linksAdded++;
    }
    for (const sid of ourSapo) {
      if (merged.value.has(sid)) continue;
      const categoryId = localIdOfCategory.get(sid);
      if (categoryId === undefined) continue;
      await db
        .deleteFrom("product_categories")
        .where("productId", "=", productId)
        .where("categoryId", "=", categoryId)
        .execute();
      linksRemoved++;
    }
  }

  // --- park conflicts, and heal the ones that agree again ----------------
  //
  // Re-evaluated every run rather than trusted: if Sapo has since moved back
  // to our value the conflict simply is not raised again, so it heals instead
  // of sitting there forever.
  const previouslyOpen = await db
    .selectFrom("sync_conflicts")
    .select(["id", "entity", "sapoId", "field"])
    .where("resolvedAt", "is", null)
    .execute();
  const stillConflicting = new Set(
    openedConflicts.map((c) => `${c.entity}:${c.sapoId}:${c.field}`),
  );
  const healed = previouslyOpen.filter(
    (p) => !stillConflicting.has(`${p.entity}:${p.sapoId}:${p.field}`),
  );
  for (const h of healed) {
    await db.deleteFrom("sync_conflicts").where("id", "=", h.id).execute();
  }

  const alreadyOpen = new Set(
    previouslyOpen.map((p) => `${p.entity}:${p.sapoId}:${p.field}`),
  );
  const newConflicts = openedConflicts.filter(
    (c) => !alreadyOpen.has(`${c.entity}:${c.sapoId}:${c.field}`),
  );
  for (const rows of chunked(newConflicts)) {
    await db
      .insertInto("sync_conflicts")
      .values(
        rows.map((c) => ({
          id: newId(),
          entity: c.entity,
          sapoId: c.sapoId,
          field: c.field,
          base: c.base === undefined ? null : JSON.stringify(c.base),
          ours: c.ours === undefined ? null : JSON.stringify(c.ours),
          theirs: c.theirs === undefined ? null : JSON.stringify(c.theirs),
          detectedAt: now,
          resolvedAt: null,
          resolution: null,
        })),
      )
      .execute();
  }

  // --- the mirror, written last ------------------------------------------
  //
  // After applying, so a run that failed part-way does not claim to have seen
  // a state it never finished reconciling. A mirror that drifts from what was
  // applied turns every later run into a false conflict.
  for (const rows of chunked(nextMirror)) {
    for (const m of rows) {
      await db
        .deleteFrom("sapo_mirror")
        .where("entity", "=", m.entity)
        .where("sapoId", "=", m.sapoId)
        .execute();
    }
    await db
      .insertInto("sapo_mirror")
      .values(
        rows.map((m) => ({
          entity: m.entity,
          sapoId: m.sapoId,
          payload: JSON.stringify(m.payload),
          syncedAt: now,
        })),
      )
      .execute();
  }

  return {
    categories: {
      added: categoryPlan.insert.length,
      updated: categoryPlan.update.length,
      keptOurs: categoryKeptOurs,
      unchanged: categoryPlan.unchanged,
      vanished: categoryPlan.vanished.map((v) => v.name),
      unfiled: newCategoryRows.map((r) => r.name),
    },
    products: {
      added: productPlan.insert.length,
      updated: productPlan.update.length,
      keptOurs: productKeptOurs,
      unchanged: productPlan.unchanged,
      vanished: productPlan.vanished.map((v) => v.name),
    },
    links: { added: linksAdded, removed: linksRemoved, keptLocal },
    conflicts: {
      opened: newConflicts.length,
      healed: healed.length,
      open: previouslyOpen.length - healed.length + newConflicts.length,
    },
  };
};

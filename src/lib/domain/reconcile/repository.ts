/**
 * Reads for the reconciliation page: open conflicts, and what we hold that
 * Sapo has not seen.
 *
 * Its own module rather than a corner of the product or category repository,
 * because it is about the *relationship* between the two systems rather than
 * about either entity — and because both queries span `sapo_mirror`, which
 * neither entity owns.
 */

import { readContext } from "@/lib/context";
import type { Divergence } from "@/lib/domain/divergence";
import { divergedFields } from "@/lib/domain/divergence";

export type OpenConflict = {
  readonly id: string;
  readonly entity: string;
  readonly sapoId: string;
  readonly field: string;
  readonly base: unknown;
  readonly ours: unknown;
  readonly theirs: unknown;
  /** The row's current name here, so the heading is one someone recognises. */
  readonly label: string;
};

export type DivergenceRow = Divergence & { readonly label: string };

const parse = (value: string | null): unknown =>
  value === null ? null : (JSON.parse(value) as unknown);

/** Sapo owns these. Anything else on the row is ours and cannot diverge. */
const CATEGORY_FIELDS = ["name", "slug"] as const;
const PRODUCT_FIELDS = [
  "name",
  "slug",
  "sku",
  "description",
  "priceMinor",
] as const;

export const dbReconcileRepo = {
  openConflicts: async (): Promise<readonly OpenConflict[]> => {
    const { db } = await readContext();
    const rows = await db
      .selectFrom("sync_conflicts")
      .selectAll()
      .where("resolvedAt", "is", null)
      .orderBy("detectedAt", "desc")
      .execute();
    if (rows.length === 0) return [];

    const [categories, products] = await Promise.all([
      db.selectFrom("categories").select(["sapoId", "name"]).execute(),
      db.selectFrom("products").select(["sapoId", "name"]).execute(),
    ]);
    const label = new Map<string, string>();
    for (const c of categories) {
      if (c.sapoId !== null) label.set(`category:${c.sapoId}`, c.name);
    }
    for (const p of products) {
      if (p.sapoId !== null) label.set(`product:${p.sapoId}`, p.name);
    }

    // Plain objects, not driver rows: these cross to a client component, and
    // a null-prototype row throws "Only plain objects can be passed to Client
    // Components" on the request while building clean.
    return rows.map((r) => ({
      id: r.id,
      entity: r.entity,
      sapoId: r.sapoId,
      field: r.field,
      base: parse(r.base),
      ours: parse(r.ours),
      theirs: parse(r.theirs),
      label: label.get(`${r.entity}:${r.sapoId}`) ?? `${r.entity} ${r.sapoId}`,
    }));
  },

  /**
   * Everything we hold that the mirror does not.
   *
   * Compared in memory because it is field-by-field against opaque JSON,
   * which no predicate can express the same way on both drivers. The volume
   * is bounded by rows that have a `sapoId`, not by history.
   */
  divergences: async (): Promise<readonly DivergenceRow[]> => {
    const { db } = await readContext();
    const mirror = new Map(
      (
        await db
          .selectFrom("sapo_mirror")
          .select(["entity", "sapoId", "payload"])
          .execute()
      ).map((m) => [
        `${m.entity}:${m.sapoId}`,
        JSON.parse(m.payload) as Record<string, unknown>,
      ]),
    );

    const out: DivergenceRow[] = [];

    for (const c of await db
      .selectFrom("categories")
      .select(["sapoId", "name", "slug"])
      .where("sapoId", "is not", null)
      .execute()) {
      for (const d of divergedFields(
        "category",
        c.sapoId!,
        CATEGORY_FIELDS,
        mirror.get(`category:${c.sapoId!}`),
        { name: c.name, slug: c.slug },
      )) {
        out.push({ ...d, label: c.name });
      }
    }

    for (const p of await db
      .selectFrom("products")
      .select(["sapoId", "name", "slug", "sku", "description", "priceMinor"])
      .where("sapoId", "is not", null)
      .execute()) {
      for (const d of divergedFields(
        "product",
        p.sapoId!,
        PRODUCT_FIELDS,
        mirror.get(`product:${p.sapoId!}`),
        {
          name: p.name,
          slug: p.slug,
          sku: p.sku,
          description: p.description,
          priceMinor: p.priceMinor,
        },
      )) {
        out.push({ ...d, label: p.name });
      }
    }

    return out;
  },
};

/**
 * 005 — remember where a row came from, so we can link back to it.
 *
 * **Sapo is the system of record.** This dashboard is a companion view over
 * the same catalogue: nicer to read, faster to search, and — critically — not
 * where an edit is finally made. An operator who spots something wrong here
 * fixes it in Sapo, so every row that was imported needs a way back to its
 * original. `sapoId` is that way; `lib/sapo.ts` turns it into an admin URL.
 *
 * **Nullable, and no foreign key to anything.** A product created in this app
 * has no Sapo counterpart and must stay perfectly valid without one — the
 * column records a fact about provenance, it does not make Sapo a dependency.
 * That is also why nothing here is `NOT NULL`: every existing row keeps
 * working, which is what lets this ship without a `db:reset`.
 *
 * **Unique, but only over the rows that have one.** Two products must not
 * claim the same Sapo id — a re-import that duplicated a row would otherwise
 * be invisible. Both drivers treat NULLs as distinct in a unique index, so
 * the constraint costs the locally-created rows nothing.
 *
 * There is no backfill: the seeded rows this replaces had no Sapo origin, and
 * inventing one would be a lie in a column whose whole job is provenance.
 */

import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("products").addColumn("sapoId", "text").execute();
  await db.schema
    .alterTable("categories")
    .addColumn("sapoId", "text")
    .execute();

  await db.schema
    .createIndex("idx_products_sapo_id")
    .on("products")
    .column("sapoId")
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_categories_sapo_id")
    .on("categories")
    .column("sapoId")
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("idx_categories_sapo_id").execute();
  await db.schema.dropIndex("idx_products_sapo_id").execute();
  await db.schema.alterTable("categories").dropColumn("sapoId").execute();
  await db.schema.alterTable("products").dropColumn("sapoId").execute();
}

/**
 * 002 — `categories`.
 *
 * `parentId` ships now and goes unused: v1 renders one flat level, but a
 * category tree is the single most likely next request for a catalogue, and
 * adding the column later means backfilling rows people have already created.
 * The column costs nothing; the migration would cost a release.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("categories")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("slug", "text", (c) => c.notNull().unique())
    .addColumn("parentId", "text")
    .addColumn("createdAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updatedAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  // The categories page lists alphabetically; the filter dropdown reads the
  // same order.
  await db.schema
    .createIndex("idx_categories_name")
    .on("categories")
    .column("name")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("categories").execute();
}

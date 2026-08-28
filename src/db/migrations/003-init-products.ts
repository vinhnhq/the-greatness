/**
 * 003 — `products`, `product_categories`, `product_attachments`.
 *
 * Three things worth stating, because none of them are recoverable cheaply:
 *
 *   - **`priceMinor` is an integer**, in the currency's minor unit. A float
 *     price is wrong by construction: 19.99 is not representable in binary
 *     floating point, and the error compounds the first time anything sums a
 *     column. `lib/money.ts` owns the conversions.
 *   - **`product_categories` has a composite primary key**, so linking the
 *     same category twice is impossible rather than merely discouraged.
 *   - **An attachment stores both URLs.** `originUrl` is what the operator
 *     uploaded and is never regenerated; `optimizedUrl` is derived and may be
 *     null — when browser optimization fails, `lib/media/prepare.ts` keeps the
 *     origin rather than losing the file, and the UI falls back to it.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("products")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("slug", "text", (c) => c.notNull().unique())
    .addColumn("sku", "text")
    .addColumn("description", "text")
    .addColumn("priceMinor", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("currency", "text", (c) => c.notNull().defaultTo("VND"))
    .addColumn("status", "text", (c) => c.notNull().defaultTo("draft"))
    .addColumn("createdAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updatedAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  // A sku is optional, but two products may not share one. A plain UNIQUE
  // allows many NULLs on both drivers, which is exactly the wanted semantics.
  await db.schema
    .createIndex("idx_products_sku")
    .on("products")
    .column("sku")
    .unique()
    .execute();

  // The list's default order (newest activity first) and its status filter —
  // status leads because it is the selective half.
  await db.schema
    .createIndex("idx_products_status_updated")
    .on("products")
    .columns(["status", "updatedAt"])
    .execute();

  await db.schema
    .createTable("product_categories")
    .addColumn("productId", "text", (c) => c.notNull())
    .addColumn("categoryId", "text", (c) => c.notNull())
    .addPrimaryKeyConstraint("pk_product_categories", [
      "productId",
      "categoryId",
    ])
    .execute();

  // "Which products are in this category" — the list page's category filter
  // reads this direction; the primary key already covers the other one.
  await db.schema
    .createIndex("idx_product_categories_category")
    .on("product_categories")
    .column("categoryId")
    .execute();

  await db.schema
    .createTable("product_attachments")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("productId", "text", (c) => c.notNull())
    .addColumn("kind", "text", (c) => c.notNull())
    .addColumn("originUrl", "text", (c) => c.notNull())
    .addColumn("optimizedUrl", "text")
    .addColumn("posterUrl", "text")
    .addColumn("mime", "text", (c) => c.notNull())
    .addColumn("bytes", "integer", (c) => c.notNull())
    .addColumn("optimizedBytes", "integer")
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("durationMs", "integer")
    .addColumn("position", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("alt", "text")
    .addColumn("createdAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  // Every read of an attachment is "this product's, in display order" — the
  // list page's thumbnail included.
  await db.schema
    .createIndex("idx_product_attachments_product")
    .on("product_attachments")
    .columns(["productId", "position"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("product_attachments").execute();
  await db.schema.dropTable("product_categories").execute();
  await db.schema.dropTable("products").execute();
}

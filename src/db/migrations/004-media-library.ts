/**
 * 004 — media becomes a library.
 *
 * Until now an attachment belonged to exactly one product
 * (`product_attachments.productId NOT NULL`) and could only be created from
 * that product's form. That makes the obvious things impossible: uploading a
 * batch before deciding what it is for, reusing one photograph on two
 * products, or opening a library at all.
 *
 * This splits the row in two:
 *
 *   - **`media_assets`** — the file. No owner. `alt` lives here because it
 *     describes the picture, not the relationship to a product.
 *   - **`product_media`** — the link, carrying `position`, because order is a
 *     property of *this product's* gallery and two products may order the
 *     same assets differently.
 *
 * **The backfill is the point of this file.** A migration that requires
 * `db:reset` is not a migration — it is a reset with extra steps, and it
 * would throw away every image the seeded catalogue already has. Each old row
 * becomes one asset plus one link, keeping its id so the storage keys already
 * written to disk keep resolving.
 *
 * Written as separate statements rather than one `DO` block: the SQLite
 * driver has no procedural language, and this repo runs both drivers. Each
 * step is independently safe to re-run.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("media_assets")
    .addColumn("id", "text", (c) => c.primaryKey())
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
    .addColumn("alt", "text")
    .addColumn("createdAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  // The library's one read: everything, newest first. `id` is a uuid v7, so
  // it is the chronological tiebreaker for assets sharing a timestamp.
  await db.schema
    .createIndex("idx_media_assets_created")
    .on("media_assets")
    .columns(["createdAt", "id"])
    .execute();

  // The kind tabs filter on this, and it is two-valued, so it earns an index
  // only in combination with the sort.
  await db.schema
    .createIndex("idx_media_assets_kind")
    .on("media_assets")
    .columns(["kind", "createdAt"])
    .execute();

  await db.schema
    .createTable("product_media")
    .addColumn("productId", "text", (c) => c.notNull())
    .addColumn("mediaId", "text", (c) => c.notNull())
    .addColumn("position", "integer", (c) => c.notNull().defaultTo(0))
    .addPrimaryKeyConstraint("pk_product_media", ["productId", "mediaId"])
    .execute();

  // "This product's gallery, in order" — every product read wants it.
  await db.schema
    .createIndex("idx_product_media_product")
    .on("product_media")
    .columns(["productId", "position"])
    .execute();

  // "Which products use this asset" — the usage count the delete confirmation
  // needs, and the reason deleting from the library can warn instead of
  // silently blanking a product page.
  await db.schema
    .createIndex("idx_product_media_media")
    .on("product_media")
    .column("mediaId")
    .execute();

  // ── Backfill ──────────────────────────────────────────────────────────
  // Ids are preserved, so `/uploads/products/<productId>/<attachmentId>/…`
  // paths already on disk keep resolving. New assets are filed under
  // `media/<id>/…`; both shapes are just strings to the serving route.
  await sql`
    insert into media_assets (
      id, kind, "originUrl", "optimizedUrl", "posterUrl", mime, bytes,
      "optimizedBytes", width, height, "durationMs", alt, "createdAt"
    )
    select
      id, kind, "originUrl", "optimizedUrl", "posterUrl", mime, bytes,
      "optimizedBytes", width, height, "durationMs", alt, "createdAt"
    from product_attachments
  `.execute(db);

  await sql`
    insert into product_media ("productId", "mediaId", position)
    select "productId", id, position from product_attachments
  `.execute(db);

  await db.schema.dropTable("product_attachments").execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Rebuild the old shape and fold the library back into it.
  //
  // **This direction is lossy and cannot not be.** An asset linked to two
  // products becomes two rows, and an asset linked to none is dropped
  // entirely — the old schema has nowhere to put a file that belongs to
  // nobody. That is the honest inverse: rolling back a model change loses
  // what only the new model could express.
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

  await db.schema
    .createIndex("idx_product_attachments_product")
    .on("product_attachments")
    .columns(["productId", "position"])
    .execute();

  // An asset on two products needs two primary keys and has one id, so the
  // second link is dropped rather than colliding.
  await sql`
    insert into product_attachments (
      id, "productId", kind, "originUrl", "optimizedUrl", "posterUrl", mime,
      bytes, "optimizedBytes", width, height, "durationMs", position, alt,
      "createdAt"
    )
    select
      m.id, pm."productId", m.kind, m."originUrl", m."optimizedUrl",
      m."posterUrl", m.mime, m.bytes, m."optimizedBytes", m.width, m.height,
      m."durationMs", pm.position, m.alt, m."createdAt"
    from media_assets m
    join product_media pm on pm."mediaId" = m.id
    where pm."productId" = (
      select min(inner_pm."productId")
      from product_media inner_pm
      where inner_pm."mediaId" = m.id
    )
  `.execute(db);

  await db.schema.dropTable("product_media").execute();
  await db.schema.dropTable("media_assets").execute();
}

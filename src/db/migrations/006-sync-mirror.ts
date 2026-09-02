/**
 * 006 — the mirror, and the conflicts it makes possible.
 *
 * **Why a mirror exists at all.** Sapo emits no events: no webhook, no change
 * feed, only `/products.json` polled. So the only way to know what *Sapo*
 * changed between two syncs is to diff today's payload against the last one
 * we saw — and that requires storing it. `sapo_mirror` is that store, and it
 * turns the sync from a two-way overwrite into a three-way merge:
 *
 *     base   = sapo_mirror    what Sapo said last time
 *     theirs = incoming Sapo  what it says now
 *     ours   = the live row   what the operator edited
 *
 * The branch this unlocks is **"we changed it and Sapo did not — keep ours"**,
 * which does not exist today and is why a re-parented category survives only
 * until the next `sync:sapo`.
 *
 * **A mirror rather than doubled columns.** The alternative was `name` beside
 * `sapoName` on every syncable field. That doubles the schema, doubles every
 * future migration, and forces `sapoName ?? name` into every read. Here
 * `products` and `categories` stay the *effective* rows — no page, component
 * or repository read changes at all — and the previous state lives off to one
 * side as opaque JSON.
 *
 * **The payload is JSON on purpose.** Its shape is Sapo's, not ours, and it is
 * only ever compared field-by-field against a freshly-fetched payload of the
 * same shape. Giving it columns would mean migrating this table every time
 * Sapo adds a field we mirror, for no query we ever run — nothing filters or
 * sorts on it.
 *
 * **`sync_conflicts` is a table, not a report.** A plan is a snapshot of a
 * moment; "fetch, show the diff, decide now, apply" turns however long review
 * takes into a window where Sapo can move, and applying a stale plan
 * overwrites something nobody saw. Parking conflicts as rows lets the sync
 * apply the three automatic buckets and never block on a human — which is
 * what keeps it safe to schedule — while the decision stays genuinely open.
 *
 * `resolvedAt` is nullable rather than the row being deleted: a conflict that
 * was decided is the one piece of reconciliation history worth keeping, and
 * `V6.16` will want it.
 *
 * **There is deliberately no backfill, and that is not an oversight.** Seeding
 * the mirror from the current local rows would assert "Sapo said this" about
 * every row — false for any row already edited here, which is exactly the
 * population this feature exists to protect. The honest behaviour is an
 * absent base: the first sync finds no mirror row, adopts the incoming
 * payload as authoritative, and writes it. Nothing is lost, because the seed
 * loaded those rows from Sapo's own snapshot in the first place.
 *
 * **No foreign keys**, matching `sapoId` in 005. Both tables are keyed by
 * Sapo's id, and a mirror row must survive its local row being deleted — that
 * is precisely the case the next sync has to reason about.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("sapo_mirror")
    // `entity` + `sapoId`, because a product and a category can share an id.
    .addColumn("entity", "text", (c) => c.notNull())
    .addColumn("sapoId", "text", (c) => c.notNull())
    .addColumn("payload", "text", (c) => c.notNull())
    .addColumn("syncedAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addPrimaryKeyConstraint("pk_sapo_mirror", ["entity", "sapoId"])
    .execute();

  await db.schema
    .createTable("sync_conflicts")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("entity", "text", (c) => c.notNull())
    .addColumn("sapoId", "text", (c) => c.notNull())
    // Which field disagreed. One row per field, not per entity: a product
    // whose price moved upstream while we renamed it has one conflict, not
    // two, and merging them would force an all-or-nothing decision.
    .addColumn("field", "text", (c) => c.notNull())
    .addColumn("base", "text")
    .addColumn("ours", "text")
    .addColumn("theirs", "text")
    .addColumn("detectedAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("resolvedAt", "timestamptz")
    // 'ours' | 'theirs', null while open.
    .addColumn("resolution", "text")
    .execute();

  // One open conflict per field. Re-running the sync re-evaluates rather than
  // accumulating duplicates, and this is what makes that cheap to look up.
  await db.schema
    .createIndex("idx_sync_conflicts_open")
    .on("sync_conflicts")
    .columns(["entity", "sapoId", "field"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("sync_conflicts").execute();
  await db.schema.dropTable("sapo_mirror").execute();
}

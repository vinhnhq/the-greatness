/**
 * 001 — the four tables better-auth owns (users · sessions · accounts ·
 * verifications), in the shapes its Kysely adapter expects.
 *
 * Written in the portable subset: `text` ids (app-minted uuid v7, see
 * `lib/id.ts`), `timestamptz` (which SQLite stores as ISO text), and
 * `integer` for the one boolean. No foreign keys — the app has one writer and
 * declares its relationships in `db-types.ts`; adding them later is a
 * migration, adding them now is a constraint on a schema still moving.
 */

import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("email", "text", (c) => c.notNull().unique())
    .addColumn("emailVerified", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("name", "text")
    .addColumn("image", "text")
    .addColumn("createdAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updatedAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  await db.schema
    .createTable("sessions")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("userId", "text", (c) => c.notNull())
    .addColumn("token", "text", (c) => c.notNull().unique())
    .addColumn("expiresAt", "timestamptz", (c) => c.notNull())
    .addColumn("ipAddress", "text")
    .addColumn("userAgent", "text")
    .addColumn("createdAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updatedAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  // Every request resolves a session by its cookie token, so this index is on
  // the app's hottest read path.
  await db.schema
    .createIndex("idx_sessions_token")
    .on("sessions")
    .column("token")
    .execute();

  await db.schema
    .createTable("accounts")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("userId", "text", (c) => c.notNull())
    .addColumn("accountId", "text", (c) => c.notNull())
    .addColumn("providerId", "text", (c) => c.notNull())
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("accessTokenExpiresAt", "timestamptz")
    .addColumn("refreshTokenExpiresAt", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("idToken", "text")
    .addColumn("password", "text")
    .addColumn("createdAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updatedAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  await db.schema
    .createIndex("idx_accounts_user")
    .on("accounts")
    .column("userId")
    .execute();

  await db.schema
    .createTable("verifications")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("identifier", "text", (c) => c.notNull())
    .addColumn("value", "text", (c) => c.notNull())
    .addColumn("expiresAt", "timestamptz", (c) => c.notNull())
    .addColumn("createdAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .addColumn("updatedAt", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`current_timestamp`),
    )
    .execute();

  await db.schema
    .createIndex("idx_verifications_identifier")
    .on("verifications")
    .column("identifier")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("verifications").execute();
  await db.schema.dropTable("accounts").execute();
  await db.schema.dropTable("sessions").execute();
  await db.schema.dropTable("users").execute();
}

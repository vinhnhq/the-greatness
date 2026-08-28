/**
 * The database seam ([spec AC-8](../../__project__/spec.md)).
 *
 * One `Kysely<DB>` whose dialect is chosen from the environment:
 *
 *   - `sqlite`   → embedded SQLite (Bun's or Node's built-in) at
 *                  `.data/the-greatness.db`. The local default: no Docker, no
 *                  cloud account, `bun install` and go.
 *   - `postgres` → Neon over HTTP. Preview and production.
 *
 * Nothing above this file branches on the driver. Repositories build queries
 * through Kysely, which compiles the portable subset both accept; the two
 * places SQL genuinely differs — case-insensitive search and `on conflict`
 * upserts — are isolated in `src/lib/db/portable.ts` rather than duplicated.
 *
 * The connection is resolved **lazily**: both dialects only touch their
 * config on the first query, so importing this module during `next build`, or
 * in a test before env loading has run, is safe.
 */

import { neon } from "@neondatabase/serverless";
import { Kysely } from "kysely";
import { NeonDialect } from "kysely-neon";

import type { DB } from "./db-types";
import { getDatabaseDriver, getPostgresUrl, getSqliteFile } from "./db-url";
import { SqliteDialect } from "./db/sqlite-dialect";

export const createDb = (): Kysely<DB> =>
  getDatabaseDriver() === "postgres"
    ? new Kysely<DB>({
        dialect: new NeonDialect({ neon: () => neon(getPostgresUrl()) }),
      })
    : new Kysely<DB>({
        dialect: new SqliteDialect({ filename: getSqliteFile() }),
      });

/**
 * The process-wide instance. `import { db }` belongs in exactly two places:
 * `src/lib/context.ts` (which hands it to every repository) and
 * `src/lib/auth.ts` (better-auth needs the connection at construction time).
 * Everything else reads it from request context — see the note there.
 */
export const db: Kysely<DB> = createDb();

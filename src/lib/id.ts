/**
 * The one place a persisted identifier is minted.
 *
 * **uuid v7, not v4.** The leading 48 bits are a Unix millisecond timestamp,
 * so lexical order and chronological order agree. That keeps ties in an
 * `ORDER BY "createdAt", id` chain falling in insertion order instead of
 * arbitrarily, and keeps inserts append-mostly in the btree rather than
 * scattering them the way v4 does.
 *
 * **Minted here, not by the database.** SQLite has no uuid function at all
 * and Postgres's `gen_random_uuid()` produces v4, so a column default would
 * mean rows whose id version depended on whether an insert happened to name
 * the column — worse than either choice alone.
 *
 * **From the `uuid` package, not hand-rolled.** The version and variant
 * nibbles sit at defined offsets; getting them wrong yields a string that
 * looks like a uuid, passes a `uuid` column check, and sorts wrongly forever.
 *
 * Scope is identifiers that get **stored**. A per-request trace id is not one
 * — it never reaches a table, so it stays on `crypto.randomUUID()`.
 */

import { v7 } from "uuid";

/** A fresh time-ordered id for a row about to be written. Callers brand it at
 * the boundary they own (`newId() as ProductId`). */
export const newId = (): string => v7();

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a route handle is an id rather than a slug — the discriminator for
 * routes that accept either. */
export const isId = (handle: string): boolean => UUID_RE.test(handle);

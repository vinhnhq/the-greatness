/**
 * The two places SQLite and Postgres genuinely disagree, isolated so no
 * repository has to know which driver is live.
 *
 * Everything else the app queries compiles identically through Kysely. These
 * two do not, and both were found the expensive way in other projects: a
 * `LIKE` search that is case-sensitive on one driver and not the other looks
 * like a search bug rather than a dialect bug, and it only shows up for the
 * users whose data has capitals in it.
 */

import { type Expression, type RawBuilder, sql } from "kysely";

import { getDatabaseDriver } from "../db-url";

/**
 * Case-insensitive "contains" over a text column.
 *
 * Postgres: `ILIKE`. SQLite: `LIKE` is already case-insensitive for ASCII,
 * but *only* for ASCII — `LOWER()` on both sides is what makes `Áo` match
 * `áo`, which matters for a catalogue with Vietnamese product names.
 */
export const containsInsensitive = (
  column: Expression<string | null>,
  term: string,
): RawBuilder<boolean> => {
  const pattern = `%${escapeLikePattern(term)}%`;
  return getDatabaseDriver() === "postgres"
    ? sql<boolean>`${column} ILIKE ${pattern} ESCAPE '\\'`
    : sql<boolean>`LOWER(${column}) LIKE LOWER(${pattern}) ESCAPE '\\'`;
};

/**
 * Neutralise the wildcards a user can type. Without this, a search for `100%`
 * matches every row, and `_` matches any single character — both silently.
 */
export const escapeLikePattern = (term: string): string =>
  term.replace(/[\\%_]/g, (ch) => `\\${ch}`);

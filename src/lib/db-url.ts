/**
 * Resolves the database location for every caller — Next.js server code,
 * Vitest, and the standalone CLI scripts (`bun run migrate`, `bun run seed`).
 *
 * Reads `process.env` directly rather than going through `env-server.ts`,
 * which carries `import "server-only"` and therefore throws the moment a CLI
 * script imports it.
 */

export type DatabaseDriver = "sqlite" | "postgres";

/** Default so a fresh clone runs with no `.env.local` at all. */
const DEFAULT_SQLITE_FILE = ".data/the-greatness.db";

export const getDatabaseDriver = (): DatabaseDriver => {
  const raw = process.env.DATABASE_DRIVER?.trim().toLowerCase();
  if (raw === "postgres" || raw === "sqlite") return raw;
  if (raw === undefined || raw === "") {
    // A Postgres URL with no explicit driver is unambiguous intent — this is
    // how a Vercel deployment with only `DATABASE_URL` set does the right
    // thing without a second variable.
    return process.env.DATABASE_URL ? "postgres" : "sqlite";
  }
  throw new Error(
    `DATABASE_DRIVER must be "sqlite" or "postgres"; got ${JSON.stringify(raw)}.`,
  );
};

export const getSqliteFile = (): string =>
  process.env.DATABASE_FILE?.trim() || DEFAULT_SQLITE_FILE;

export const getPostgresUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set, but DATABASE_DRIVER=postgres. Add it to .env.local, or drop the driver override to use the local SQLite file.",
    );
  }
  return url;
};

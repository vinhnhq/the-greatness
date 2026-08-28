/**
 * Opens the local SQLite database against whichever runtime is executing.
 *
 * **Why this is not just `import { Database } from "bun:sqlite"`.** The local
 * database has to be reachable from three processes that do not share a
 * runtime: `bun run migrate` / `bun run seed` (Bun), `next dev` (Node — Next
 * spawns its server through the `next` shebang, not through Bun), and Vitest
 * (Node). An unconditional `bun:sqlite` import works in the first and throws
 * `Cannot find package 'bun:sqlite'` in the other two, which is exactly how
 * this file came to exist.
 *
 * Both drivers are embedded SQLite with the same C library underneath and
 * near-identical surfaces; the two places they differ — how a statement
 * reports its result columns, and how the module is reached without a bundler
 * trying to resolve it — are normalised here, so `sqlite-dialect.ts` sees one
 * shape.
 *
 * Bun is preferred whenever it is the host: it is the faster of the two and
 * the one the project standardises on. Node's `node:sqlite` is the fallback
 * that keeps `next dev` and the test suite working with no native dependency
 * and no `node-gyp`.
 */

/** The subset of a prepared statement the dialect uses. */
export type SqliteStatement = {
  /** Column names, empty for a statement that returns no rows. */
  readonly columnNames: readonly string[];
  all(...parameters: readonly unknown[]): unknown[];
  run(...parameters: readonly unknown[]): {
    readonly changes: number | bigint;
    readonly lastInsertRowid: number | bigint;
  };
};

export type SqliteHandle = {
  prepare(sql: string): SqliteStatement;
  close(): void;
  /** Which driver actually answered — surfaced by `/api/health` and the
   * migration runner's banner so "it works on my machine" has a value to
   * compare. */
  readonly runtime: "bun" | "node";
};

// Assembled at runtime so no bundler can statically resolve `bun:sqlite` and
// fail the build on the Node side, where the module does not exist.
const BUN_SQLITE = ["bun", "sqlite"].join(":");

const openBun = async (filename: string): Promise<SqliteHandle> => {
  const specifier = BUN_SQLITE;
  const { Database } = (await import(/* @vite-ignore */ specifier)) as {
    Database: new (
      path: string,
      options?: { create?: boolean },
    ) => {
      prepare(sql: string): {
        columnNames: string[];
        all(...p: unknown[]): unknown[];
        run(...p: unknown[]): {
          changes: number;
          lastInsertRowid: number | bigint;
        };
      };
      close(): void;
    };
  };
  const db = new Database(filename, { create: true });
  return {
    runtime: "bun",
    close: () => db.close(),
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        get columnNames() {
          return stmt.columnNames;
        },
        all: (...p) => stmt.all(...p),
        run: (...p) => stmt.run(...p),
      };
    },
  };
};

const openNode = (filename: string): SqliteHandle => {
  // `process.getBuiltinModule` reaches a Node builtin without a bundler ever
  // seeing an import specifier — the same problem as the Bun branch, solved
  // the other way round because a builtin is always present.
  const sqlite = process.getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      prepare(sql: string): {
        columns(): ReadonlyArray<{ name: string }>;
        all(...p: unknown[]): unknown[];
        run(...p: unknown[]): {
          changes: number | bigint;
          lastInsertRowid: number | bigint;
        };
      };
      close(): void;
    };
  };
  const db = new sqlite.DatabaseSync(filename);
  return {
    runtime: "node",
    close: () => db.close(),
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        get columnNames() {
          return stmt.columns().map((c) => c.name);
        },
        all: (...p) => stmt.all(...p),
        run: (...p) => stmt.run(...p),
      };
    },
  };
};

/** `:memory:` for a scratch database, otherwise a path (created if absent). */
export const openSqlite = async (filename: string): Promise<SqliteHandle> =>
  typeof process.versions.bun === "string"
    ? await openBun(filename)
    : openNode(filename);

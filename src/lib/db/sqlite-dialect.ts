/**
 * A Kysely dialect over embedded SQLite — the local half of the DB seam
 * ([spec AC-8](../../../__project__/spec.md)).
 *
 * Kysely ships `SqliteDialect`, but it is written against `better-sqlite3`'s
 * API: it reads `statement.reader` to decide whether a query returns rows, and
 * it expects a native binding this project deliberately does not install.
 * `openSqlite()` reaches Bun's or Node's built-in SQLite instead, so local
 * development needs nothing but `bun install` — which is worth 100 lines here.
 *
 * Three behaviours the driver has to supply that the built-ins do not:
 *
 *   1. **Reader detection.** Neither driver exposes `.reader`; a statement's
 *      column list is empty when it returns no rows, which is the same signal.
 *   2. **Parameter binding.** SQLite binds numbers, strings, bigints, buffers
 *      and null. A `Date` or a `boolean` reaches the driver unchanged from
 *      Kysely — both are ordinary on the Postgres side — so they are
 *      normalised here rather than at every call site.
 *   3. **Serialisation.** SQLite has one writer. Every query is queued on a
 *      promise chain so a transaction's statements cannot interleave with an
 *      unrelated query and commit someone else's work.
 */

import {
  CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type TransactionSettings,
} from "kysely";

import { openSqlite, type SqliteHandle } from "./sqlite-open";

export type SqliteDialectConfig = {
  /** `:memory:` for a scratch database, otherwise a file path. */
  readonly filename: string;
};

/** The value shapes SQLite binds directly. */
type Bindable = string | number | bigint | null | Uint8Array;

export const normaliseParameter = (value: unknown): Bindable => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  // An object reaching a SQLite parameter is a jsonb column on the Postgres
  // side; storing the same JSON text keeps both drivers reading equal rows.
  return JSON.stringify(value);
};

type Compiled = {
  readonly sql: string;
  readonly parameters: readonly unknown[];
};

class SqliteConnection implements DatabaseConnection {
  readonly #db: SqliteHandle;
  /** The serialisation chain — see note 3 in the module docblock. */
  #tail: Promise<unknown> = Promise.resolve();

  constructor(db: SqliteHandle) {
    this.#db = db;
  }

  executeQuery<R>(compiledQuery: Compiled): Promise<QueryResult<R>> {
    const run = () => this.#executeNow<R>(compiledQuery);
    const queued = this.#tail.then(run, run);
    // Keep the chain alive past a rejection, or one failed query would poison
    // every query queued behind it on this connection.
    this.#tail = queued.catch(() => undefined);
    return queued;
  }

  #executeNow<R>(compiledQuery: Compiled): Promise<QueryResult<R>> {
    const statement = this.#db.prepare(compiledQuery.sql);
    const parameters = compiledQuery.parameters.map(normaliseParameter);

    if (statement.columnNames.length > 0) {
      return Promise.resolve({ rows: statement.all(...parameters) as R[] });
    }

    const { changes, lastInsertRowid } = statement.run(...parameters);
    return Promise.resolve({
      rows: [],
      numAffectedRows: BigInt(changes),
      insertId: BigInt(lastInsertRowid),
    });
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error(
      "streamQuery is not supported by SqliteDialect — the driver is synchronous, so a stream would buffer the whole result anyway.",
    );
  }
}

class SqliteDriver implements Driver {
  readonly #config: SqliteDialectConfig;
  #handle: SqliteHandle | undefined;
  #connection: SqliteConnection | undefined;

  constructor(config: SqliteDialectConfig) {
    this.#config = config;
  }

  async init(): Promise<void> {
    this.#handle = await openSqlite(this.#config.filename);
    this.#connection = new SqliteConnection(this.#handle);
    // WAL keeps readers from blocking on the dev server's writer. An
    // in-memory database has no journal to switch, so it is skipped rather
    // than failing every test file's first query.
    if (this.#config.filename !== ":memory:") {
      await this.#connection.executeQuery(
        CompiledQuery.raw("pragma journal_mode = wal"),
      );
    }
    // Foreign keys are OFF by default in SQLite, which would make every FK a
    // comment locally while Postgres enforced it — the worst kind of drift.
    await this.#connection.executeQuery(
      CompiledQuery.raw("pragma foreign_keys = on"),
    );
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    if (!this.#connection) {
      throw new Error("SqliteDriver.init() has not run yet.");
    }
    return this.#connection;
  }

  async beginTransaction(
    connection: DatabaseConnection,
    settings: TransactionSettings,
  ): Promise<void> {
    if (settings.isolationLevel) {
      throw new Error(
        `SQLite has one isolation level (serializable); "${settings.isolationLevel}" was requested. Drop the option rather than special-casing the driver.`,
      );
    }
    await connection.executeQuery(CompiledQuery.raw("begin"));
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("commit"));
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw("rollback"));
  }

  async releaseConnection(): Promise<void> {
    // One long-lived connection; nothing to hand back to a pool.
  }

  async destroy(): Promise<void> {
    this.#handle?.close();
    this.#handle = undefined;
    this.#connection = undefined;
  }
}

export class SqliteDialect implements Dialect {
  readonly #config: SqliteDialectConfig;

  constructor(config: SqliteDialectConfig) {
    this.#config = config;
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createDriver(): Driver {
    return new SqliteDriver(this.#config);
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }
}

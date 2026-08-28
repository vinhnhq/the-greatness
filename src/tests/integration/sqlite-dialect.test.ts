/**
 * D.1 — the embedded-SQLite Kysely dialect.
 *
 * The point of these tests is the *seam*, not SQLite: every shape the app's
 * repositories rely on has to come back looking the way the Postgres driver
 * would return it. The three that bite are `returningAll()` (SQLite gives it
 * back only when the statement declares RETURNING), `numAffectedRows` on a
 * write (bun reports `changes` as a number, Kysely wants a bigint), and a
 * rollback actually undoing work — SQLite serializes on one connection, so a
 * transaction that silently no-ops would look fine until two writes had to
 * fail together.
 */

import { Kysely, sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteDialect } from "@/lib/db/sqlite-dialect";

interface TestDB {
  widget: {
    id: string;
    name: string;
    qty: number;
    createdAt: string;
  };
}

let db: Kysely<TestDB>;

beforeEach(async () => {
  db = new Kysely<TestDB>({
    dialect: new SqliteDialect({ filename: ":memory:" }),
  });
  await db.schema
    .createTable("widget")
    .addColumn("id", "text", (c) => c.primaryKey())
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("qty", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("createdAt", "text", (c) => c.notNull())
    .execute();
});

afterEach(async () => {
  await db.destroy();
});

const seed = (id: string, name: string, qty = 1) =>
  db
    .insertInto("widget")
    .values({ id, name, qty, createdAt: new Date(0).toISOString() })
    .execute();

describe("BunSqliteDialect", () => {
  it("round-trips insert → select → update → delete", async () => {
    await seed("w1", "anvil", 3);

    const rows = await db.selectFrom("widget").selectAll().execute();
    expect(rows).toEqual([
      {
        id: "w1",
        name: "anvil",
        qty: 3,
        createdAt: "1970-01-01T00:00:00.000Z",
      },
    ]);

    await db
      .updateTable("widget")
      .set({ qty: 5 })
      .where("id", "=", "w1")
      .execute();
    const after = await db
      .selectFrom("widget")
      .select("qty")
      .executeTakeFirstOrThrow();
    expect(after.qty).toBe(5);

    await db.deleteFrom("widget").where("id", "=", "w1").execute();
    expect(await db.selectFrom("widget").selectAll().execute()).toEqual([]);
  });

  it("returns the inserted row from returningAll()", async () => {
    const row = await db
      .insertInto("widget")
      .values({
        id: "w2",
        name: "hammer",
        qty: 2,
        createdAt: new Date(0).toISOString(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    expect(row.name).toBe("hammer");
    expect(row.qty).toBe(2);
  });

  it("reports numAffectedRows as a bigint on writes", async () => {
    await seed("w3", "saw");
    await seed("w4", "saw");

    const result = await db
      .updateTable("widget")
      .set({ qty: 9 })
      .where("name", "=", "saw")
      .executeTakeFirst();

    expect(result.numUpdatedRows).toBe(2n);
  });

  it("commits a transaction", async () => {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("widget")
        .values({
          id: "w5",
          name: "drill",
          qty: 1,
          createdAt: new Date(0).toISOString(),
        })
        .execute();
    });

    expect(await db.selectFrom("widget").selectAll().execute()).toHaveLength(1);
  });

  it("rolls the whole transaction back when the body throws", async () => {
    await seed("w6", "plane");

    await expect(
      db.transaction().execute(async (trx) => {
        await trx.deleteFrom("widget").where("id", "=", "w6").execute();
        await trx
          .insertInto("widget")
          .values({
            id: "w7",
            name: "chisel",
            qty: 1,
            createdAt: new Date(0).toISOString(),
          })
          .execute();
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const rows = await db.selectFrom("widget").selectAll().execute();
    expect(rows.map((r) => r.id)).toEqual(["w6"]);
  });

  it("binds Date and boolean parameters the way Postgres would accept them", async () => {
    // Kysely happily passes a Date or a boolean straight through; bun:sqlite
    // binds neither usefully, so the driver normalises before binding.
    await db
      .insertInto("widget")
      .values({
        id: "w8",
        name: "level",
        qty: 1,
        // Deliberately the wrong static type: this is the runtime value a
        // Date-typed column carries on the Postgres side.
        createdAt: new Date("2020-05-06T07:08:09.000Z") as unknown as string,
      })
      .execute();

    const row = await db
      .selectFrom("widget")
      .select("createdAt")
      .where("id", "=", "w8")
      .executeTakeFirstOrThrow();
    expect(row.createdAt).toBe("2020-05-06T07:08:09.000Z");

    const flagged = await sql<{
      v: number;
    }>`select ${true} as v`.execute(db);
    expect(flagged.rows[0].v).toBe(1);
  });

  it("runs DDL through the same connection", async () => {
    await db.schema
      .createIndex("idx_widget_name")
      .on("widget")
      .column("name")
      .execute();
    const idx = await sql<{
      name: string;
    }>`select name from sqlite_master where type = 'index'`.execute(db);
    expect(idx.rows.map((i) => i.name)).toContain("idx_widget_name");
  });
});

describe("SqliteDialect — unsupported operations", () => {
  it("refuses to stream rather than silently buffering the whole result", async () => {
    // Kysely's `.stream()` promises bounded memory. The driver is synchronous
    // and would have to read everything first, so a "working" stream here
    // would be a lie that only shows up as an OOM on a large table.
    await expect(
      (async () => {
        for await (const _ of db.selectFrom("widget").selectAll().stream()) {
          // unreachable
        }
      })(),
    ).rejects.toThrow(/streamQuery is not supported/);
  });

  it("refuses an isolation level SQLite cannot honour", async () => {
    // Accepting and ignoring it would mean code that reads as if it asked for
    // a weaker isolation and silently got serializable — on one driver only.
    await expect(
      db
        .transaction()
        .setIsolationLevel("read committed")
        .execute(async () => undefined),
    ).rejects.toThrow(/one isolation level/);
  });
});

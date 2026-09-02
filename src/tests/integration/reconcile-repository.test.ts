/**
 * The reconciliation reads, against a real database.
 *
 * Both answer questions that only make sense with a mirror, and both have a
 * trap worth pinning: a conflict must carry a label a person recognises
 * rather than a Sapo id, and a row that has never been mirrored must not be
 * reported as diverged — never compared is not the same as changed here.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { Kysely } from "kysely";
import { FileMigrationProvider, Migrator } from "kysely/migration";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type RequestContext, runWithContext } from "@/lib/context";
import type { DB } from "@/lib/db-types";
import { SqliteDialect } from "@/lib/db/sqlite-dialect";
import { dbReconcileRepo } from "@/lib/domain/reconcile/repository";

let db: Kysely<DB>;
let ctx: RequestContext;
const NOW = new Date("2026-09-02T00:00:00Z");

const inCtx = <T>(fn: () => Promise<T>): Promise<T> =>
  runWithContext(ctx, fn) as Promise<T>;

const category = async (sapoId: string, name: string) => {
  await db
    .insertInto("categories")
    .values({
      id: `c-${sapoId}`,
      name,
      slug: `slug-${sapoId}`,
      parentId: null,
      sapoId,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .execute();
};

const mirror = async (
  entity: string,
  sapoId: string,
  payload: Record<string, unknown>,
) => {
  await db
    .insertInto("sapo_mirror")
    .values({
      entity,
      sapoId,
      payload: JSON.stringify(payload),
      syncedAt: NOW,
    })
    .execute();
};

beforeEach(async () => {
  db = new Kysely<DB>({ dialect: new SqliteDialect({ filename: ":memory:" }) });
  ctx = { db, user: null, requestId: "test" };
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.resolve("src/db/migrations"),
    }),
  });
  const { error } = await migrator.migrateToLatest();
  if (error) throw error;
});

afterEach(async () => {
  await db.destroy();
});

describe("dbReconcileRepo.divergences", () => {
  it("reports a field we changed since the mirror", async () => {
    await category("1", "Ours now");
    await mirror("category", "1", { name: "Sapo said", slug: "slug-1" });

    const rows = await inCtx(() => dbReconcileRepo.divergences());
    expect(rows).toEqual([
      {
        entity: "category",
        sapoId: "1",
        field: "name",
        base: "Sapo said",
        ours: "Ours now",
        label: "Ours now",
      },
    ]);
  });

  it("reports nothing when we match the mirror", async () => {
    await category("1", "Same");
    await mirror("category", "1", { name: "Same", slug: "slug-1" });
    expect(await inCtx(() => dbReconcileRepo.divergences())).toEqual([]);
  });

  it("claims nothing for a row that has never been mirrored", async () => {
    // Never compared is not changed. Without this, the first run under v6
    // would put every row in a review nobody asked for.
    await category("1", "Whatever");
    expect(await inCtx(() => dbReconcileRepo.divergences())).toEqual([]);
  });

  it("ignores a category created here, which has no Sapo counterpart", async () => {
    await db
      .insertInto("categories")
      .values({
        id: "local",
        name: "Ours",
        slug: "ours",
        parentId: null,
        sapoId: null,
        createdAt: NOW,
        updatedAt: NOW,
      })
      .execute();
    expect(await inCtx(() => dbReconcileRepo.divergences())).toEqual([]);
  });
});

describe("dbReconcileRepo.openConflicts", () => {
  const conflict = async (over: Partial<Record<string, unknown>> = {}) => {
    await db
      .insertInto("sync_conflicts")
      .values({
        id: "k1",
        entity: "category",
        sapoId: "1",
        field: "name",
        base: JSON.stringify("Was"),
        ours: JSON.stringify("Ours"),
        theirs: JSON.stringify("Theirs"),
        detectedAt: NOW,
        resolvedAt: null,
        resolution: null,
        ...over,
      })
      .execute();
  };

  it("returns base, ours and theirs decoded", async () => {
    await category("1", "Ours");
    await conflict();

    const [row] = await inCtx(() => dbReconcileRepo.openConflicts());
    expect(row).toMatchObject({
      field: "name",
      base: "Was",
      ours: "Ours",
      theirs: "Theirs",
    });
  });

  it("labels a conflict with the row's current name, not its Sapo id", async () => {
    // "category 4347441" is not a thing anyone can act on.
    await category("1", "Quạt đứng");
    await conflict();
    const [row] = await inCtx(() => dbReconcileRepo.openConflicts());
    expect(row?.label).toBe("Quạt đứng");
  });

  it("falls back to the id when the row is gone", async () => {
    await conflict();
    const [row] = await inCtx(() => dbReconcileRepo.openConflicts());
    expect(row?.label).toBe("category 1");
  });

  it("omits a resolved conflict", async () => {
    await category("1", "Ours");
    await conflict({ resolvedAt: NOW, resolution: "ours" });
    expect(await inCtx(() => dbReconcileRepo.openConflicts())).toEqual([]);
  });

  it("does not query for labels when there is nothing open", async () => {
    expect(await inCtx(() => dbReconcileRepo.openConflicts())).toEqual([]);
  });
});

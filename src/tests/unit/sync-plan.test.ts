/**
 * What a refresh from Sapo would do, decided before anything is written.
 *
 * The seed is `deleteFrom` on five tables. That is right for seeding and
 * catastrophic as a recurring job: it would drop the curated tree, every
 * media link and every operator edit on each run. So the sync plans first,
 * and the two rules it must never break are asserted here rather than trusted
 * to the shell that applies it — nothing local is deleted, and `parentId` is
 * never in an update.
 */

import { describe, expect, it } from "vitest";

import { planSync, type SyncPlan } from "@/lib/domain/sync-plan";

type Local = {
  id: string;
  sapoId: string | null;
  name: string;
  slug: string;
  parentId: string | null;
};
type Remote = { sapoId: string; name: string; slug: string };

const local = (
  id: string,
  sapoId: string | null,
  name: string,
  parentId: string | null = null,
): Local => ({ id, sapoId, name, slug: name.toLowerCase(), parentId });

const remote = (sapoId: string, name: string): Remote => ({
  sapoId,
  name,
  slug: name.toLowerCase(),
});

/** Only the fields Sapo owns. `parentId` is deliberately not among them. */
const diff = (l: Local, r: Remote): Partial<Local> | null =>
  l.name === r.name && l.slug === r.slug
    ? null
    : { name: r.name, slug: r.slug };

const plan = (l: readonly Local[], r: readonly Remote[]): SyncPlan<Remote> =>
  planSync(l, r, diff);

describe("planSync", () => {
  it("inserts a row Sapo has and we do not", () => {
    const p = plan([], [remote("1", "Nồi cơm điện")]);
    expect(p.insert.map((r) => r.sapoId)).toEqual(["1"]);
    expect(p.update).toEqual([]);
  });

  it("updates a row whose name changed upstream", () => {
    const p = plan([local("a", "1", "Old")], [remote("1", "New")]);
    expect(p.insert).toEqual([]);
    expect(p.update).toEqual([
      { id: "a", changes: { name: "New", slug: "new" } },
    ]);
  });

  it("leaves an unchanged row alone rather than rewriting it", () => {
    // A no-op run must be a no-op, or every sync bumps updatedAt on 832 rows
    // and the report becomes meaningless.
    const p = plan([local("a", "1", "Same")], [remote("1", "Same")]);
    expect(p.update).toEqual([]);
    expect(p.unchanged).toBe(1);
  });

  it("never puts parentId in an update, even when the local row has one", () => {
    // THE invariant. Creation order is a one-time reconstruction; the tree is
    // ours after seeding and a sync that touched it would silently reshape
    // the catalogue on a schedule.
    const p = plan([local("a", "1", "Old", "parent-x")], [remote("1", "New")]);
    for (const u of p.update) {
      expect(Object.keys(u.changes)).not.toContain("parentId");
    }
  });

  it("reports a row that vanished upstream instead of deleting it", () => {
    const p = plan([local("a", "1", "Gone")], []);
    expect(p.vanished.map((v) => v.id)).toEqual(["a"]);
    // There is no delete list at all — the shape makes deletion unexpressible.
    expect(p).not.toHaveProperty("delete");
  });

  it("ignores local rows that were created here and have no sapoId", () => {
    // A category an operator added is not "missing from Sapo"; it was never
    // there.
    const p = plan([local("a", null, "Ours")], []);
    expect(p.vanished).toEqual([]);
    expect(p.unchanged).toBe(0);
  });

  it("handles all four states in one pass", () => {
    const p = plan(
      [
        local("a", "1", "Unchanged"),
        local("b", "2", "Stale"),
        local("c", "3", "Gone"),
        local("d", null, "Ours"),
      ],
      [
        remote("1", "Unchanged"),
        remote("2", "Fresh"),
        remote("4", "Brand New"),
      ],
    );
    expect(p.insert.map((r) => r.sapoId)).toEqual(["4"]);
    expect(p.update.map((u) => u.id)).toEqual(["b"]);
    expect(p.vanished.map((v) => v.id)).toEqual(["c"]);
    expect(p.unchanged).toBe(1);
  });

  it("counts the same totals it acts on", () => {
    // The report is the only thing anyone reads; it must add up.
    const p = plan(
      [local("a", "1", "A"), local("b", "2", "B")],
      [remote("1", "A"), remote("2", "Changed"), remote("3", "C")],
    );
    expect(p.insert.length + p.update.length + p.unchanged).toBe(3);
  });

  it("takes the last remote row when Sapo repeats a sapoId", () => {
    // Defensive: two collections cannot share an id, but a concatenated
    // paged fetch that overlapped would produce one, and silently inserting
    // twice would violate the unique index at the worst moment.
    const p = plan([], [remote("1", "First"), remote("1", "Second")]);
    expect(p.insert).toHaveLength(1);
    expect(p.insert[0]?.name).toBe("Second");
  });
});

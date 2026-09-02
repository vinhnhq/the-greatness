/**
 * The category tree as the page renders it, and the counting trap in it.
 *
 * A product can sit in a parent *and* in its child — in this catalogue eight
 * fans are in "Quạt & Thiết bị làm mát" and in all nine of its children at
 * once. So a subtree count that sums its descendants reports eighty fans where
 * there are eight. Distinctness is not a refinement here; it is the difference
 * between a number and a wrong number.
 */

import { describe, expect, it } from "vitest";

import type { CategoryNode } from "@/lib/domain/categories/tree";
import {
  ancestorNames,
  ancestorsOf,
  buildCategoryForest,
  categoryPaths,
  filterForest,
  findNode,
  planMove,
} from "@/lib/domain/categories/tree";

type Row = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
};

const cat = (id: string, parentId: string | null, productCount = 0): Row => ({
  id,
  name: id,
  slug: id,
  parentId,
  productCount,
});

describe("buildCategoryForest", () => {
  it("nests children under their parent and leaves roots at the top", () => {
    const forest = buildCategoryForest(
      [cat("root", null), cat("mid", "root"), cat("leaf", "mid")],
      [],
    );
    expect(forest).toHaveLength(1);
    expect(forest[0]?.category.id).toBe("root");
    expect(forest[0]?.children[0]?.category.id).toBe("mid");
    expect(forest[0]?.children[0]?.children[0]?.category.id).toBe("leaf");
  });

  it("reports depth so a row can indent without walking back up", () => {
    const forest = buildCategoryForest(
      [cat("root", null), cat("mid", "root"), cat("leaf", "mid")],
      [],
    );
    expect(forest[0]?.depth).toBe(0);
    expect(forest[0]?.children[0]?.depth).toBe(1);
    expect(forest[0]?.children[0]?.children[0]?.depth).toBe(2);
  });

  it("counts a product once per subtree even when it is in parent and child", () => {
    // The real shape: the same eight products linked to the group and to every
    // one of its children.
    const links = [
      { categoryId: "fans", productId: "p1" },
      { categoryId: "fans", productId: "p2" },
      { categoryId: "standing", productId: "p1" },
      { categoryId: "standing", productId: "p2" },
      { categoryId: "ceiling", productId: "p1" },
      { categoryId: "ceiling", productId: "p2" },
    ];
    const forest = buildCategoryForest(
      [
        cat("fans", null, 2),
        cat("standing", "fans", 2),
        cat("ceiling", "fans", 2),
      ],
      links,
    );
    // Naive summing would say 6.
    expect(forest[0]?.subtreeCount).toBe(2);
    expect(forest[0]?.ownCount).toBe(2);
  });

  it("adds up children that hold genuinely different products", () => {
    const links = [
      { categoryId: "a", productId: "p1" },
      { categoryId: "b", productId: "p2" },
      { categoryId: "c", productId: "p3" },
    ];
    const forest = buildCategoryForest(
      [cat("a", null, 1), cat("b", "a", 1), cat("c", "a", 1)],
      links,
    );
    expect(forest[0]?.subtreeCount).toBe(3);
  });

  it("gives a group with no products of its own the count beneath it", () => {
    // Every L1 in this catalogue is empty and reads as broken without this.
    const links = [{ categoryId: "child", productId: "p1" }];
    const forest = buildCategoryForest(
      [cat("group", null, 0), cat("child", "group", 1)],
      links,
    );
    expect(forest[0]?.ownCount).toBe(0);
    expect(forest[0]?.subtreeCount).toBe(1);
  });

  it("sorts siblings by name at every level", () => {
    const forest = buildCategoryForest(
      [
        { ...cat("z", null), name: "Zebra" },
        { ...cat("a", null), name: "Apple" },
        { ...cat("m", "a"), name: "Mango" },
        { ...cat("b", "a"), name: "Banana" },
      ],
      [],
    );
    expect(forest.map((n) => n.category.name)).toEqual(["Apple", "Zebra"]);
    expect(forest[0]?.children.map((n) => n.category.name)).toEqual([
      "Banana",
      "Mango",
    ]);
  });

  it("surfaces a category whose parent is missing rather than dropping it", () => {
    // A dangling parentId must not make a row disappear from the page.
    const forest = buildCategoryForest(
      [cat("root", null), cat("orphan", "gone-away")],
      [],
    );
    expect(forest.map((n) => n.category.id).sort()).toEqual(["orphan", "root"]);
  });

  it("does not hang on a parent cycle", () => {
    // Nothing creates one today; the tree becomes editable later.
    const forest = buildCategoryForest([cat("a", "b"), cat("b", "a")], []);
    expect(forest.length).toBeGreaterThan(0);
  });

  it("returns every category exactly once", () => {
    const rows = [
      cat("root", null),
      cat("mid", "root"),
      cat("leaf", "mid"),
      cat("other", null),
    ];
    const seen: string[] = [];
    const walk = (nodes: ReturnType<typeof buildCategoryForest>): void => {
      for (const n of nodes) {
        seen.push(n.category.id);
        walk(n.children);
      }
    };
    walk(buildCategoryForest(rows, []));
    expect(seen.sort()).toEqual(["leaf", "mid", "other", "root"]);
  });
});

/**
 * Searching the picker.
 *
 * Two behaviours matter and neither is obvious. A branch whose *child*
 * matches has to survive, or typing "quạt" hides the group the matches live
 * under and the result reads as a flat list with no context. And a group that
 * matches keeps its children, so typing a group name is how you see what is
 * in it.
 */
describe("filterForest", () => {
  const rows = [
    { ...cat("home", null), name: "Thiết bị gia đình" },
    { ...cat("fans", "home"), name: "Quạt & Thiết bị làm mát" },
    { ...cat("standing", "fans"), name: "Quạt đứng" },
    { ...cat("air", "home"), name: "Chăm sóc không khí" },
    { ...cat("kitchen", null), name: "Điện gia dụng nhà bếp" },
  ];
  const forest = buildCategoryForest(rows, []);
  const names = (nodes: readonly CategoryNode<Row>[]): string[] =>
    nodes.flatMap((n) => [n.category.name, ...names(n.children)]);

  it("keeps a branch whose descendant matches", () => {
    const found = filterForest(forest, (c) => c.name.includes("Quạt đứng"));
    // The group and its parent survive so the match has context.
    expect(names(found)).toEqual([
      "Thiết bị gia đình",
      "Quạt & Thiết bị làm mát",
      "Quạt đứng",
    ]);
  });

  it("keeps the whole subtree of a group that matches itself", () => {
    const found = filterForest(forest, (c) => c.name === "Chăm sóc không khí");
    expect(names(found)).toEqual(["Thiết bị gia đình", "Chăm sóc không khí"]);
  });

  it("drops a branch with no match anywhere in it", () => {
    const found = filterForest(forest, (c) => c.name.includes("Quạt"));
    expect(names(found)).not.toContain("Điện gia dụng nhà bếp");
    expect(names(found)).not.toContain("Chăm sóc không khí");
  });

  it("returns nothing when nothing matches", () => {
    expect(filterForest(forest, () => false)).toEqual([]);
  });

  it("returns everything when everything matches", () => {
    expect(names(filterForest(forest, () => true))).toEqual(names(forest));
  });
});

describe("ancestorNames", () => {
  it("names the path to a nested category, nearest parent last", () => {
    const rows = [
      { ...cat("home", null), name: "Thiết bị gia đình" },
      { ...cat("fans", "home"), name: "Quạt" },
      { ...cat("standing", "fans"), name: "Quạt đứng" },
    ];
    expect(ancestorNames(rows, "standing")).toEqual([
      "Thiết bị gia đình",
      "Quạt",
    ]);
  });

  it("is empty for a root", () => {
    expect(ancestorNames([cat("root", null)], "root")).toEqual([]);
  });

  it("stops on a cycle instead of looping forever", () => {
    expect(ancestorNames([cat("a", "b"), cat("b", "a")], "a")).toEqual(["b"]);
  });
});

/**
 * Walking to one category.
 *
 * The drill-down needs two things the forest does not hand it directly: the
 * node for a given id, wherever it sits, and the chain of ancestors above it
 * for the breadcrumb. Both have to survive the shapes `buildCategoryForest`
 * tolerates — a dangling parent, and a cycle.
 */
describe("findNode and ancestorsOf", () => {
  const rows = [
    { ...cat("home", null), name: "Thiết bị gia đình" },
    { ...cat("fans", "home"), name: "Quạt" },
    { ...cat("standing", "fans"), name: "Quạt đứng" },
    { ...cat("other", null), name: "Khác" },
  ];
  const forest = buildCategoryForest(rows, []);

  it("finds a leaf two levels down", () => {
    expect(findNode(forest, "standing")?.category.name).toBe("Quạt đứng");
  });

  it("finds a root", () => {
    expect(findNode(forest, "home")?.category.name).toBe("Thiết bị gia đình");
  });

  it("returns null for an id that is not in the tree", () => {
    expect(findNode(forest, "nope")).toBeNull();
  });

  it("returns the node with its children and counts intact", () => {
    const node = findNode(forest, "fans");
    expect(node?.children.map((c) => c.category.id)).toEqual(["standing"]);
    expect(node?.depth).toBe(1);
  });

  it("gives the ancestor chain outermost first, for a breadcrumb", () => {
    expect(ancestorsOf(rows, "standing").map((c) => c.id)).toEqual([
      "home",
      "fans",
    ]);
  });

  it("gives a root no ancestors", () => {
    expect(ancestorsOf(rows, "home")).toEqual([]);
  });

  it("stops on a cycle rather than looping forever", () => {
    expect(
      ancestorsOf([cat("a", "b"), cat("b", "a")], "a").map((c) => c.id),
    ).toEqual(["b"]);
  });

  it("stops where a parent is missing rather than throwing", () => {
    expect(ancestorsOf([cat("orphan", "gone")], "orphan")).toEqual([]);
  });
});

/**
 * Moving a category.
 *
 * Deliberately re-parenting, not sortable-with-indent. Siblings sort by name
 * at every level (`buildCategoryForest`), so there is no position for a drag
 * to express — the offset-based projection the dnd-kit tree example uses
 * would be machinery for an ordering this app does not have.
 *
 * That leaves one rule that actually matters: a category may not be dropped
 * inside itself, because the result has no root and would vanish from the
 * page entirely.
 */
describe("planMove", () => {
  const rows = [
    cat("root", null),
    cat("mid", "root"),
    cat("leaf", "mid"),
    cat("other", null),
  ];

  it("re-parents onto another category", () => {
    expect(planMove(rows, "leaf", "other")).toEqual({
      ok: true,
      id: "leaf",
      parentId: "other",
    });
  });

  it("promotes to the top level when dropped on nothing", () => {
    expect(planMove(rows, "leaf", null)).toEqual({
      ok: true,
      id: "leaf",
      parentId: null,
    });
  });

  it("refuses to drop a category on itself", () => {
    expect(planMove(rows, "mid", "mid")).toMatchObject({ ok: false });
  });

  it("refuses to drop a category inside its own descendant", () => {
    // The cycle case. `buildCategoryForest` survives one — it promotes the
    // stranded rows — but a tree that can be corrupted by a drag should not
    // allow the drag.
    expect(planMove(rows, "root", "leaf")).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/inside itself/i),
    });
  });

  it("refuses a drop that changes nothing", () => {
    // Already this parent. Reporting "moved" would be a lie, and writing
    // would bump updatedAt for no reason.
    expect(planMove(rows, "mid", "root")).toMatchObject({ ok: false });
    expect(planMove(rows, "root", null)).toMatchObject({ ok: false });
  });

  it("refuses to move a category that is not in the tree", () => {
    expect(planMove(rows, "ghost", "root")).toMatchObject({ ok: false });
  });

  it("refuses to move onto a category that is not in the tree", () => {
    expect(planMove(rows, "leaf", "ghost")).toMatchObject({ ok: false });
  });
});

describe("categoryPaths", () => {
  const named = (id: string, name: string, parentId: string | null): Row => ({
    id,
    name,
    slug: id,
    parentId,
    productCount: 0,
  });

  it("agrees with ancestorNames for every row", () => {
    const rows = [
      named("a", "Thiết bị gia đình", null),
      named("b", "Quạt & Thiết bị làm mát", "a"),
      named("c", "Quạt đứng", "b"),
      named("d", "Nhà bếp", null),
    ];

    const paths = categoryPaths(rows);

    for (const row of rows) {
      expect(paths.get(row.id)).toEqual(ancestorNames(rows, row.id));
    }
  });

  it("gives a root the empty path and a leaf its whole ancestry", () => {
    const rows = [
      named("a", "Root", null),
      named("b", "Mid", "a"),
      named("c", "Leaf", "b"),
    ];

    const paths = categoryPaths(rows);

    expect(paths.get("a")).toEqual([]);
    expect(paths.get("b")).toEqual(["Root"]);
    expect(paths.get("c")).toEqual(["Root", "Mid"]);
  });

  it("treats a dangling parent as a root, the way buildCategoryForest does", () => {
    const paths = categoryPaths([named("orphan", "Orphan", "gone")]);

    expect(paths.get("orphan")).toEqual([]);
  });

  it("terminates on a cycle instead of hanging", () => {
    const paths = categoryPaths([named("a", "A", "b"), named("b", "B", "a")]);

    // Whatever it reports, it reports something — and never itself.
    expect(paths.get("a")).not.toContain("A");
    expect(paths.get("b")).not.toContain("B");
  });
});

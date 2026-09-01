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
  buildCategoryForest,
  filterForest,
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

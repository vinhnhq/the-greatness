/**
 * The tree with products in it, and the 697 that are in no category.
 *
 * The counting trap `category-tree.test.ts` guards is about *categories*
 * double-counting a product. This file guards the other half: a product in
 * eleven categories has to appear eleven times, and a product in none has to
 * appear at all.
 */

import { describe, expect, it } from "vitest";

import type { TreeProduct } from "@/lib/domain/categories/taxonomy";
import {
  filterTaxonomy,
  groupProducts,
} from "@/lib/domain/categories/taxonomy";
import { buildCategoryForest } from "@/lib/domain/categories/tree";

type Row = {
  id: string;
  name: string;
  parentId: string | null;
  productCount: number;
};

const cat = (id: string, name: string, parentId: string | null): Row => ({
  id,
  name,
  parentId,
  productCount: 0,
});

const prod = (
  id: string,
  name: string,
  sku: string | null = null,
): TreeProduct => ({
  id,
  name,
  sku,
  status: "active",
});

describe("groupProducts", () => {
  it("buckets a product under every category it is in", () => {
    const { byCategory, unfiled } = groupProducts(
      [prod("p1", "Fan")],
      [
        { categoryId: "a", productId: "p1" },
        { categoryId: "b", productId: "p1" },
        { categoryId: "c", productId: "p1" },
      ],
    );

    // Eleven in the real catalogue; three is the same shape.
    expect(byCategory.get("a")).toEqual([prod("p1", "Fan")]);
    expect(byCategory.get("b")).toEqual([prod("p1", "Fan")]);
    expect(byCategory.get("c")).toEqual([prod("p1", "Fan")]);
    expect(unfiled).toEqual([]);
  });

  it("puts a product with no link in unfiled, not nowhere", () => {
    const { byCategory, unfiled } = groupProducts(
      [prod("p1", "Filed"), prod("p2", "Homeless")],
      [{ categoryId: "a", productId: "p1" }],
    );

    expect(byCategory.get("a")).toHaveLength(1);
    expect(unfiled.map((p) => p.id)).toEqual(["p2"]);
  });

  it("ignores a link to a product that is not in the list", () => {
    const { byCategory, unfiled } = groupProducts(
      [prod("p1", "Here")],
      [
        { categoryId: "a", productId: "p1" },
        { categoryId: "a", productId: "gone" },
      ],
    );

    expect(byCategory.get("a")).toHaveLength(1);
    expect(unfiled).toEqual([]);
  });

  it("keeps the order it was given", () => {
    const { unfiled } = groupProducts(
      [prod("p1", "Ấm"), prod("p2", "Bếp"), prod("p3", "Chảo")],
      [],
    );

    expect(unfiled.map((p) => p.name)).toEqual(["Ấm", "Bếp", "Chảo"]);
  });
});

describe("filterTaxonomy", () => {
  const categories = [
    cat("group", "Thiết bị gia đình", null),
    cat("mid", "Quạt & Thiết bị làm mát", "group"),
    cat("leaf", "Quạt đứng", "mid"),
    cat("kitchen", "Nhà bếp", null),
  ];
  const products = [
    prod("p1", "Quạt tích điện", "QTD-1"),
    prod("p2", "Nồi cơm điện", "NCD-2"),
    prod("p3", "Ấm siêu tốc", null),
  ];
  const links = [
    { categoryId: "leaf", productId: "p1" },
    { categoryId: "kitchen", productId: "p2" },
  ];

  const forest = buildCategoryForest(categories, links);
  const grouped = groupProducts(products, links);

  it("returns everything untouched for an empty term", () => {
    const result = filterTaxonomy(forest, grouped, "  ");

    expect(result.forest).toBe(forest);
    expect(result.grouped).toBe(grouped);
  });

  it("finds a product by name and keeps the branch above it", () => {
    const result = filterTaxonomy(forest, grouped, "noi com");

    // Only the branch that leads to the match survives.
    expect(result.forest.map((n) => n.category.id)).toEqual(["kitchen"]);
    expect(result.grouped.byCategory.get("kitchen")?.map((p) => p.id)).toEqual([
      "p2",
    ]);
  });

  it("folds diacritics, so `quat` finds `Quạt`", () => {
    const result = filterTaxonomy(forest, grouped, "quat");

    expect(result.forest.map((n) => n.category.id)).toEqual(["group"]);
  });

  it("finds a product by sku", () => {
    const result = filterTaxonomy(forest, grouped, "NCD");

    expect(result.grouped.byCategory.get("kitchen")?.map((p) => p.id)).toEqual([
      "p2",
    ]);
  });

  it("a matching category keeps its whole subtree and all its products", () => {
    // "Thiết bị gia đình" matches; its leaf's product must survive even
    // though the product itself does not match.
    const result = filterTaxonomy(forest, grouped, "gia dinh");

    expect(result.forest).toHaveLength(1);
    const group = result.forest[0]!;
    expect(group.children.map((c) => c.category.id)).toEqual(["mid"]);
    expect(result.grouped.byCategory.get("leaf")?.map((p) => p.id)).toEqual([
      "p1",
    ]);
  });

  it("narrows the unfiled list too", () => {
    const result = filterTaxonomy(forest, grouped, "am sieu");

    expect(result.grouped.unfiled.map((p) => p.id)).toEqual(["p3"]);
    // Nothing in the tree matches, so the tree is empty rather than whole.
    expect(result.forest).toEqual([]);
  });

  it("drops a category whose products do not match", () => {
    const result = filterTaxonomy(forest, grouped, "zzz");

    expect(result.forest).toEqual([]);
    expect(result.grouped.unfiled).toEqual([]);
    expect(result.grouped.byCategory.size).toBe(0);
  });
});

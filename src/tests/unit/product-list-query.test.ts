/**
 * This module parses the URL, and `sort` reaches an `ORDER BY`. The tests
 * below are as much a security boundary as a behaviour spec.
 */

import { describe, expect, it } from "vitest";

import type { CategoryId } from "@/lib/domain/categories/entity";
import {
  DEFAULT_QUERY,
  pageCount,
  parseProductListQuery,
  productListHref,
  withQuery,
} from "@/lib/domain/products/list-query";

describe("parseProductListQuery", () => {
  it("returns the defaults for an empty URL", () => {
    expect(parseProductListQuery({})).toEqual(DEFAULT_QUERY);
  });

  it("reads every facet", () => {
    expect(
      parseProductListQuery({
        q: "  tote  ",
        status: "active",
        category: "cat-1",
        sort: "price-desc",
        page: "3",
      }),
    ).toEqual({
      search: "tote",
      status: "active",
      categoryId: "cat-1",
      sort: "price-desc",
      page: 3,
    });
  });

  it("falls back rather than throwing on a hand-edited URL", () => {
    const q = parseProductListQuery({
      status: "deleted",
      sort: "name; drop table products",
      page: "-4",
    });
    expect(q.status).toBe("all");
    expect(q.sort).toBe("updated-desc");
    expect(q.page).toBe(1);
  });

  it.each(["0", "-1", "1.5", "abc", "", "1e3", "Infinity", "NaN"])(
    "rejects page=%s down to 1",
    (page) => {
      expect(parseProductListQuery({ page }).page).toBe(1);
    },
  );

  it("caps the search term", () => {
    const q = parseProductListQuery({ q: "x".repeat(500) });
    expect(q.search).toHaveLength(100);
  });

  it("treats a blank search as no search, not as a wildcard", () => {
    // `LIKE '%%'` matches every row including nulls-as-empty and defeats the
    // index; "no search" has to be a distinct state.
    expect(parseProductListQuery({ q: "   " }).search).toBe("");
  });

  it("takes the first value when a key repeats", () => {
    expect(parseProductListQuery({ status: ["active", "draft"] }).status).toBe(
      "active",
    );
  });
});

describe("toSearchParams / productListHref", () => {
  it("omits every default so the canonical URL is bare", () => {
    expect(productListHref(DEFAULT_QUERY)).toBe("/products");
  });

  it("round-trips a fully-specified query", () => {
    const query = {
      search: "áo dài",
      status: "archived",
      categoryId: "cat-9" as CategoryId,
      sort: "name-asc",
      page: 4,
    } as const;
    const href = productListHref(query);
    const parsed = parseProductListQuery(
      Object.fromEntries(new URL(href, "http://x").searchParams),
    );
    expect(parsed).toEqual(query);
  });

  it("keeps page out of the URL when it is 1", () => {
    expect(productListHref({ ...DEFAULT_QUERY, search: "bag" })).toBe(
      "/products?q=bag",
    );
  });
});

describe("withQuery", () => {
  it("returns to page 1 when a filter changes", () => {
    // Staying on page 4 while narrowing to 12 rows shows an empty table, which
    // reads as "no results" rather than "you are past the end".
    const at4 = { ...DEFAULT_QUERY, page: 4 };
    expect(withQuery(at4, { status: "active" }).page).toBe(1);
    expect(withQuery(at4, { search: "bag" }).page).toBe(1);
    expect(withQuery(at4, { sort: "name-asc" }).page).toBe(1);
  });

  it("keeps the page when paging is what changed", () => {
    expect(withQuery(DEFAULT_QUERY, { page: 3 }).page).toBe(3);
  });
});

describe("pageCount", () => {
  it.each([
    [0, 1],
    [1, 1],
    [25, 1],
    [26, 2],
    [50, 2],
    [51, 3],
  ])("%i rows → %i pages", (total, expected) => {
    expect(pageCount(total)).toBe(expected);
  });
});

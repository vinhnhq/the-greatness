/**
 * The fold both sides of every catalogue search go through. Its correctness
 * is what makes a plain `LIKE` behave identically on SQLite and Postgres —
 * see `lib/search-text.ts` for why that is not the obvious approach.
 */

import { describe, expect, it } from "vitest";

import {
  escapeLikePattern,
  foldForSearch,
  productSearchText,
  searchPattern,
} from "@/lib/search-text";

describe("foldForSearch", () => {
  it("lowercases", () => {
    expect(foldForSearch("Leather TOTE")).toBe("leather tote");
  });

  it("strips Vietnamese diacritics so an undecorated search still matches", () => {
    expect(foldForSearch("Áo Dài Lụa")).toBe("ao dai lua");
    expect(foldForSearch("Đèn Bàn Gỗ")).toBe("den ban go");
    expect(foldForSearch("CÀ PHÊ SỮA ĐÁ")).toBe("ca phe sua da");
  });

  it("folds a searcher's plain typing to the same value as the stored name", () => {
    // This equality is the whole mechanism: the column and the query are
    // compared after the same fold, so LIKE never has to be clever.
    expect(foldForSearch("ao dai")).toBe(foldForSearch("Áo Dài"));
    expect(foldForSearch("DEN BAN")).toBe(foldForSearch("đèn bàn"));
  });

  it("collapses and trims whitespace", () => {
    expect(foldForSearch("  Leather   Tote \n Bag ")).toBe("leather tote bag");
  });

  it("leaves punctuation alone — it is part of a sku", () => {
    expect(foldForSearch("TOTE-01/A")).toBe("tote-01/a");
  });
});

describe("productSearchText", () => {
  it("joins the three searchable columns", () => {
    expect(
      productSearchText({
        name: "Áo Dài",
        sku: "AD-01",
        description: "Lụa tơ tằm",
      }),
    ).toBe("ao dai ad-01 lua to tam");
  });

  it("handles null sku and description without leaving stray spaces", () => {
    expect(
      productSearchText({ name: "Tote", sku: null, description: null }),
    ).toBe("tote");
  });
});

describe("escapeLikePattern", () => {
  it.each([
    ["100%", "100\\%"],
    ["a_b", "a\\_b"],
    ["back\\slash", "back\\\\slash"],
    ["plain", "plain"],
  ])("escapes %s", (input, expected) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });
});

describe("searchPattern", () => {
  it("folds, escapes and wraps in one step", () => {
    expect(searchPattern("Áo 100%")).toBe("%ao 100\\%%");
  });
});

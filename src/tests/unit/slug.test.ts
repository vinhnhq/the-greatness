import { describe, expect, it } from "vitest";

import { MAX_SLUG_LENGTH, slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and dashes an ordinary name", () => {
    expect(slugify("Summer Tote Bag")).toBe("summer-tote-bag");
  });

  it("keeps Vietnamese words readable instead of erasing them", () => {
    // The failure this guards: NFD-stripping without the đ rule turns "Áo dài"
    // into "ao-di", and no normalisation at all turns it into "-----".
    expect(slugify("Áo dài lụa")).toBe("ao-dai-lua");
    expect(slugify("Đèn bàn gỗ")).toBe("den-ban-go");
    expect(slugify("CÀ PHÊ SỮA ĐÁ")).toBe("ca-phe-sua-da");
  });

  it("collapses punctuation and runs of separators", () => {
    expect(slugify("Bag  —  Large / Black")).toBe("bag-large-black");
    expect(slugify("50% off!!!")).toBe("50-off");
  });

  it("trims leading and trailing dashes", () => {
    expect(slugify("  --Hello--  ")).toBe("hello");
  });

  it("returns an empty string when there is nothing to slugify", () => {
    expect(slugify("🎉🎉🎉")).toBe("");
    expect(slugify("!!!")).toBe("");
    expect(slugify("")).toBe("");
  });

  it("caps the length without a trailing dash", () => {
    const slug = slugify(`${"word ".repeat(40)}`);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug when it is free", () => {
    expect(uniqueSlug("Tote Bag", new Set())).toBe("tote-bag");
  });

  it("suffixes on collision, counting from 2", () => {
    expect(uniqueSlug("Tote Bag", new Set(["tote-bag"]))).toBe("tote-bag-2");
    expect(uniqueSlug("Tote Bag", new Set(["tote-bag", "tote-bag-2"]))).toBe(
      "tote-bag-3",
    );
  });

  it("skips a gap rather than reusing a freed slug", () => {
    expect(uniqueSlug("Tote Bag", new Set(["tote-bag", "tote-bag-3"]))).toBe(
      "tote-bag-2",
    );
  });

  it("falls back to `item` for a name with no slugifiable characters", () => {
    // Returning "" here would collide with every other such name and produce
    // the URL `/products/`.
    expect(uniqueSlug("🎉", new Set())).toBe("item");
    expect(uniqueSlug("🎉", new Set(["item"]))).toBe("item-2");
  });

  it("keeps the suffixed slug inside the column's length", () => {
    const taken = new Set([slugify("x".repeat(200))]);
    const slug = uniqueSlug("x".repeat(200), taken);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
    expect(slug.endsWith("-2")).toBe(true);
  });
});

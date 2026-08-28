/**
 * These assert the *property*, not the implementation: a swap back to v4
 * would keep every "is it a uuid" check passing and break only the ordering,
 * which is exactly the failure that would go unnoticed for months.
 */

import { describe, expect, it } from "vitest";

import { isId, newId } from "@/lib/id";

describe("newId", () => {
  it("mints RFC 9562 v7 uuids (version and variant nibbles)", () => {
    const id = newId();
    expect(isId(id)).toBe(true);
    // Version nibble: character 14 of the canonical form.
    expect(id[14]).toBe("7");
    // Variant: the first character of the fourth group is 8, 9, a or b.
    expect("89ab").toContain(id[19]);
  });

  it("is unique across 10k draws", () => {
    const seen = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(seen.size).toBe(10_000);
  });

  it("sorts lexically in generation order", () => {
    const ids = Array.from({ length: 1_000 }, () => newId());
    expect([...ids].sort()).toEqual(ids);
  });

  it("encodes a timestamp within a few seconds of now", () => {
    // The first 48 bits are Unix ms. A v4 uuid would land this in the year
    // ~10000 or ~1970 depending on the draw, so it also catches a silent swap.
    const ms = Number.parseInt(newId().replace(/-/g, "").slice(0, 12), 16);
    expect(Math.abs(Date.now() - ms)).toBeLessThan(5_000);
  });
});

describe("isId", () => {
  it.each([
    ["a slug", "leather-tote-bag", false],
    ["a numeric id", "42", false],
    ["a truncated uuid", "0197f0a3-1c2d-7e4f-8a1b", false],
    ["an uppercase uuid", "0197F0A3-1C2D-7E4F-8A1B-2C3D4E5F6071", true],
    ["a v4 uuid", "9f1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d", true],
  ])("%s → %s", (_label, value, expected) => {
    expect(isId(value)).toBe(expected);
  });
});

/**
 * The row parsers.
 *
 * Their job is to be the one place a database row stops being `unknown`. Two
 * things they must get right, and both are driver-shaped:
 *
 *   - A timestamp arrives as a `Date` from Postgres and as an **ISO string**
 *     from SQLite. `z.coerce.date()` absorbs that, and these tests are what
 *     stop someone "tidying" it back to `z.date()` — which would pass on one
 *     driver and throw on the other.
 *   - A row that does not parse is **schema drift**, not a runtime case. The
 *     strict parsers throw, loudly, naming the field.
 */

import { describe, expect, it } from "vitest";

import {
  parseCategory,
  parseCategoryStrict,
} from "@/lib/domain/categories/entity";
import {
  isProductStatus,
  parseProduct,
  parseProductStrict,
} from "@/lib/domain/products/entity";

const categoryRow = (over: Record<string, unknown> = {}) => ({
  id: "cat-1",
  name: "Bags",
  slug: "bags",
  parentId: null,
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z",
  ...over,
});

const productRow = (over: Record<string, unknown> = {}) => ({
  id: "prod-1",
  name: "Leather Tote",
  slug: "leather-tote",
  sku: "TOTE-01",
  description: null,
  priceMinor: 250_000,
  currency: "VND",
  status: "active",
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z",
  ...over,
});

describe("parseCategory", () => {
  it("coerces an ISO-string timestamp into a Date", () => {
    // SQLite hands back a string; Postgres hands back a Date. Both must reach
    // the app as a Date, or every `.toISOString()` above this line breaks on
    // exactly one driver.
    const r = parseCategory(categoryRow());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.createdAt).toBeInstanceOf(Date);
      expect(r.value.createdAt.toISOString()).toBe("2026-08-28T10:00:00.000Z");
    }
  });

  it("accepts a Date as readily as a string", () => {
    const r = parseCategory(categoryRow({ createdAt: new Date(0) }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.createdAt.getTime()).toBe(0);
  });

  it("reports the offending field rather than a bare failure", () => {
    const r = parseCategory(categoryRow({ name: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.issues.join()).toContain("name");
  });

  it("throws on drift in the strict parser", () => {
    expect(() => parseCategoryStrict(categoryRow({ slug: 42 }))).toThrow(
      /schema drift/,
    );
  });
});

describe("parseProduct", () => {
  it("parses a well-formed row", () => {
    const r = parseProduct(productRow());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.priceMinor).toBe(250_000);
      expect(r.value.currency).toBe("VND");
    }
  });

  it("coerces a bigint-as-string price", () => {
    // Postgres can hand a numeric column back as a string; SQLite never does.
    const r = parseProduct(productRow({ priceMinor: "250000" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.priceMinor).toBe(250_000);
  });

  it("rejects a currency the app cannot format", () => {
    const r = parseProduct(productRow({ currency: "GBP" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.issues.join()).toContain("currency");
  });

  it("rejects a status outside the lifecycle", () => {
    const r = parseProduct(productRow({ status: "published" }));
    expect(r.ok).toBe(false);
  });

  it("throws on drift in the strict parser", () => {
    expect(() => parseProductStrict(productRow({ id: null }))).toThrow(
      /schema drift/,
    );
  });
});

describe("isProductStatus", () => {
  it.each([
    ["draft", true],
    ["active", true],
    ["archived", true],
    ["deleted", false],
    ["", false],
  ])("%s → %s", (value, expected) => {
    expect(isProductStatus(value)).toBe(expected);
  });
});

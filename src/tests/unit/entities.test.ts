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
  displayUrl,
  isProductStatus,
  parseAttachment,
  parseAttachmentStrict,
  parseProduct,
  parseProductStrict,
  primaryImage,
  type Attachment,
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

const attachmentRow = (over: Record<string, unknown> = {}) => ({
  id: "att-1",
  productId: "prod-1",
  kind: "image",
  originUrl: "/uploads/a-origin.jpg",
  optimizedUrl: "/uploads/a-optimized.webp",
  posterUrl: null,
  mime: "image/jpeg",
  bytes: 900_000,
  optimizedBytes: 50_000,
  width: 3000,
  height: 2000,
  durationMs: null,
  position: 0,
  alt: "Front",
  createdAt: "2026-08-28T10:00:00.000Z",
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

describe("parseAttachment", () => {
  it("parses an image row", () => {
    const r = parseAttachment(attachmentRow());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.optimizedUrl).toBe("/uploads/a-optimized.webp");
  });

  it("treats a null optimizedUrl as normal, not as an error", () => {
    // prepare() declines to store a re-encode that came out larger, so this
    // is the ordinary shape for a small PNG.
    const r = parseAttachment(
      attachmentRow({ optimizedUrl: null, optimizedBytes: null }),
    );
    expect(r.ok).toBe(true);
  });

  it("parses a video row with a poster and a duration", () => {
    const r = parseAttachment(
      attachmentRow({
        kind: "video",
        mime: "video/mp4",
        optimizedUrl: null,
        optimizedBytes: null,
        posterUrl: "/uploads/b-poster.webp",
        durationMs: 8_000,
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.durationMs).toBe(8_000);
  });

  it("rejects an unknown kind", () => {
    expect(parseAttachment(attachmentRow({ kind: "audio" })).ok).toBe(false);
  });

  it("rejects an empty origin url", () => {
    expect(parseAttachment(attachmentRow({ originUrl: "" })).ok).toBe(false);
  });

  it("throws on drift in the strict parser", () => {
    expect(() =>
      parseAttachmentStrict(attachmentRow({ position: "first" })),
    ).toThrow(/schema drift/);
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

const attachment = (over: Partial<Attachment>): Attachment => {
  const parsed = parseAttachment(attachmentRow());
  if (!parsed.ok) throw new Error("fixture is invalid");
  return { ...parsed.value, ...over };
};

describe("displayUrl", () => {
  it("prefers an image's optimized variant", () => {
    expect(displayUrl(attachment({}))).toBe("/uploads/a-optimized.webp");
  });

  it("falls back to an image's origin when there is no variant", () => {
    expect(displayUrl(attachment({ optimizedUrl: null }))).toBe(
      "/uploads/a-origin.jpg",
    );
  });

  it("shows a video's POSTER, not the video", () => {
    // `a.optimizedUrl ?? a.originUrl`, written inline at each call site, gets
    // this wrong and renders a 40 MB file into a 40px box.
    expect(
      displayUrl(
        attachment({
          kind: "video",
          optimizedUrl: null,
          posterUrl: "/uploads/b-poster.webp",
          originUrl: "/uploads/b.mp4",
        }),
      ),
    ).toBe("/uploads/b-poster.webp");
  });

  it("falls back to a video's origin when the poster failed", () => {
    expect(
      displayUrl(
        attachment({
          kind: "video",
          optimizedUrl: null,
          posterUrl: null,
          originUrl: "/uploads/b.mp4",
        }),
      ),
    ).toBe("/uploads/b.mp4");
  });
});

describe("primaryImage", () => {
  it("returns the first image by position, not by array order", () => {
    const chosen = primaryImage([
      attachment({ id: "b" as Attachment["id"], position: 2 }),
      attachment({ id: "a" as Attachment["id"], position: 1 }),
    ]);
    expect(chosen?.id).toBe("a");
  });

  it("skips videos — a poster is a frame, not a chosen shot", () => {
    const chosen = primaryImage([
      attachment({ id: "v" as Attachment["id"], kind: "video", position: 0 }),
      attachment({ id: "i" as Attachment["id"], position: 1 }),
    ]);
    expect(chosen?.id).toBe("i");
  });

  it("returns null when there is no image at all", () => {
    expect(primaryImage([])).toBeNull();
    expect(primaryImage([attachment({ kind: "video" })])).toBeNull();
  });
});

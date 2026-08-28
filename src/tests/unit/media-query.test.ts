/**
 * The gallery's URL parser and the month grouping.
 *
 * Same reasoning as `product-list-query.test.ts`: this parses untrusted input
 * that reaches a query, and it is the module that decides whether a shared
 * gallery link opens the view the sender was looking at.
 */

import { describe, expect, it } from "vitest";

import type { Attachment, ProductId } from "@/lib/domain/products/entity";
import { groupByMonth, monthLabel } from "@/lib/domain/products/media-grouping";
import {
  DEFAULT_MEDIA_QUERY,
  galleryHref,
  mediaPageCount,
  parseMediaQuery,
  withMediaQuery,
} from "@/lib/domain/products/media-query";
import type { MediaItem } from "@/lib/domain/products/media-repository";

describe("parseMediaQuery", () => {
  it("returns the defaults for an empty URL", () => {
    expect(parseMediaQuery({})).toEqual(DEFAULT_MEDIA_QUERY);
  });

  it("reads every facet", () => {
    expect(
      parseMediaQuery({ kind: "video", product: "prod-1", page: "3" }),
    ).toEqual({ kind: "video", productId: "prod-1", page: 3 });
  });

  it("falls back rather than throwing on a hand-edited URL", () => {
    const q = parseMediaQuery({ kind: "audio", page: "-2" });
    expect(q.kind).toBe("all");
    expect(q.page).toBe(1);
  });

  it.each(["0", "-1", "1.5", "abc", "", "Infinity"])(
    "clamps page=%s to 1",
    (page) => {
      expect(parseMediaQuery({ page }).page).toBe(1);
    },
  );

  it("takes the first value when a key repeats", () => {
    expect(parseMediaQuery({ kind: ["video", "image"] }).kind).toBe("video");
  });

  it("treats a blank product as no filter", () => {
    expect(parseMediaQuery({ product: "   " }).productId).toBeNull();
  });
});

describe("galleryHref", () => {
  it("omits every default so the canonical URL is bare", () => {
    expect(galleryHref(DEFAULT_MEDIA_QUERY)).toBe("/gallery");
  });

  it("round-trips a fully-specified query", () => {
    const query = {
      kind: "video",
      productId: "prod-9" as ProductId,
      page: 4,
    } as const;
    const parsed = parseMediaQuery(
      Object.fromEntries(new URL(galleryHref(query), "http://x").searchParams),
    );
    expect(parsed).toEqual(query);
  });
});

describe("withMediaQuery", () => {
  it("returns to page 1 when a filter changes", () => {
    // Narrowing while on page 4 otherwise shows an empty grid, which reads as
    // "no media" rather than "you are past the end".
    const at4 = { ...DEFAULT_MEDIA_QUERY, page: 4 };
    expect(withMediaQuery(at4, { kind: "video" }).page).toBe(1);
    expect(withMediaQuery(at4, { productId: "p" as ProductId }).page).toBe(1);
  });

  it("keeps the page when paging is what changed", () => {
    expect(withMediaQuery(DEFAULT_MEDIA_QUERY, { page: 2 }).page).toBe(2);
  });
});

describe("mediaPageCount", () => {
  it.each([
    [0, 1],
    [1, 1],
    [60, 1],
    [61, 2],
    [180, 3],
  ])("%i items → %i pages", (total, expected) => {
    expect(mediaPageCount(total)).toBe(expected);
  });
});

// ---------------------------------------------------------------------

const item = (id: string, createdAt: string): MediaItem => ({
  attachment: {
    id,
    productId: "p1",
    kind: "image",
    originUrl: "/uploads/a.png",
    optimizedUrl: null,
    posterUrl: null,
    mime: "image/png",
    bytes: 1,
    optimizedBytes: null,
    width: null,
    height: null,
    durationMs: null,
    position: 0,
    alt: null,
    createdAt: new Date(createdAt),
  } as Attachment,
  src: "/uploads/a.png",
  product: {
    id: "p1" as ProductId,
    name: "Tote",
    slug: "tote",
    priceMinor: 100,
    currency: "VND",
    status: "active",
  },
});

describe("groupByMonth", () => {
  it("groups consecutive items sharing a month", () => {
    const groups = groupByMonth([
      item("a", "2026-08-28T10:00:00Z"),
      item("b", "2026-08-02T10:00:00Z"),
      item("c", "2026-07-30T10:00:00Z"),
    ]);
    expect(groups.map((g) => [g.key, g.items.length])).toEqual([
      ["2026-08", 2],
      ["2026-07", 1],
    ]);
  });

  it("carries each item's index in the FLAT page, not within its group", () => {
    // This is what makes the viewer's "next" cross a month boundary instead
    // of stopping at the end of a section.
    const groups = groupByMonth([
      item("a", "2026-08-28T10:00:00Z"),
      item("b", "2026-07-30T10:00:00Z"),
      item("c", "2026-07-01T10:00:00Z"),
    ]);
    expect(groups.flatMap((g) => g.items.map((i) => i.index))).toEqual([
      0, 1, 2,
    ]);
    expect(groups[1].items[0].index).toBe(1);
  });

  it("does not merge the same month a year apart", () => {
    const groups = groupByMonth([
      item("a", "2026-08-01T10:00:00Z"),
      item("b", "2025-08-01T10:00:00Z"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-08", "2025-08"]);
  });

  it("opens a new group when a month recurs out of order", () => {
    // The rows arrive sorted, so this cannot happen in practice — but folding
    // rather than bucketing means it degrades into two groups rather than
    // silently reordering someone's library.
    const groups = groupByMonth([
      item("a", "2026-08-28T10:00:00Z"),
      item("b", "2026-07-30T10:00:00Z"),
      item("c", "2026-08-01T10:00:00Z"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["2026-08", "2026-07", "2026-08"]);
  });

  it("returns nothing for an empty page", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe("monthLabel", () => {
  it("renders a readable heading", () => {
    expect(monthLabel("2026-08")).toBe("August 2026");
    expect(monthLabel("2026-01")).toBe("January 2026");
  });

  it("is not shifted by the runner's timezone", () => {
    // A naive `new Date(2026, 0, 1)` west of UTC lands in December.
    expect(monthLabel("2026-01")).toContain("2026");
    expect(monthLabel("2026-12")).toBe("December 2026");
  });
});

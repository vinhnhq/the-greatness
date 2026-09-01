/**
 * The library asset's parser, and the two derivations every surface depends
 * on: what to render for an asset, and which one is a product's primary.
 *
 * The parser has to absorb one driver difference and one model fact:
 * timestamps arrive as a `Date` from Postgres and an ISO string from SQLite,
 * and `optimizedUrl` being null is **normal** — `prepare.ts` declines to store
 * a re-encode that came out larger.
 */

import { describe, expect, it } from "vitest";

import type { MediaAsset } from "@/lib/domain/media/entity";
import {
  mediaSrc,
  parseMediaAsset,
  parseMediaAssetStrict,
  primaryImageOf,
} from "@/lib/domain/media/entity";

const row = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  kind: "image",
  originUrl: "/uploads/media/m1/origin.jpg",
  optimizedUrl: "/uploads/media/m1/optimized.webp",
  posterUrl: null,
  mime: "image/jpeg",
  bytes: 900_000,
  optimizedBytes: 50_000,
  width: 3000,
  height: 2000,
  durationMs: null,
  alt: "Front",
  createdAt: "2026-08-28T10:00:00.000Z",
  ...over,
});

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => {
  const parsed = parseMediaAsset(row());
  if (!parsed.ok) throw new Error("fixture is invalid");
  return { ...parsed.value, ...over };
};

describe("parseMediaAsset", () => {
  it("coerces an ISO-string timestamp into a Date", () => {
    // SQLite hands back a string; Postgres hands back a Date. Both must reach
    // the app as a Date, or every `.toISOString()` above this line breaks on
    // exactly one driver.
    const r = parseMediaAsset(row());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.createdAt).toBeInstanceOf(Date);
      expect(r.value.createdAt.toISOString()).toBe("2026-08-28T10:00:00.000Z");
    }
  });

  it("accepts a Date as readily as a string", () => {
    const r = parseMediaAsset(row({ createdAt: new Date(0) }));
    if (r.ok) expect(r.value.createdAt.getTime()).toBe(0);
  });

  it("treats a null optimizedUrl as normal, not as an error", () => {
    // `prepare.ts` declines to store a re-encode that came out larger, so
    // this is the ordinary shape for a small PNG.
    expect(
      parseMediaAsset(row({ optimizedUrl: null, optimizedBytes: null })).ok,
    ).toBe(true);
  });

  it("parses a video row with a poster and a duration", () => {
    const r = parseMediaAsset(
      row({
        kind: "video",
        mime: "video/mp4",
        optimizedUrl: null,
        optimizedBytes: null,
        posterUrl: "/uploads/media/m1/poster.webp",
        durationMs: 8_000,
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.durationMs).toBe(8_000);
  });

  it.each([
    ["an unknown kind", { kind: "audio" }],
    ["an empty origin url", { originUrl: "" }],
    ["a missing id", { id: "" }],
  ])("rejects %s", (_label, over) => {
    expect(parseMediaAsset(row(over)).ok).toBe(false);
  });

  it("names the offending field rather than failing bare", () => {
    const r = parseMediaAsset(row({ kind: "audio" }));
    if (!r.ok) expect(r.error.issues.join()).toContain("kind");
  });

  it("throws on drift in the strict parser", () => {
    expect(() => parseMediaAssetStrict(row({ bytes: "lots" }))).toThrow(
      /schema drift/,
    );
  });
});

describe("mediaSrc", () => {
  it("renders an image's ORIGIN, not the variant baked at upload", () => {
    // The variant is a 1600px q82 WebP frozen when the file arrived. Serving
    // the archive instead and letting next/image derive per-breakpoint sizes
    // is smaller in a list AND sharper full-screen: measured on a 2362px
    // source, w=256 is 8.7 KB against the variant's 34.8 KB, and w=2048 keeps
    // detail the 1600px cap had thrown away.
    expect(mediaSrc(asset())).toBe("/uploads/media/m1/origin.jpg");
  });

  it("still renders the origin when no variant was ever made", () => {
    expect(mediaSrc(asset({ optimizedUrl: null }))).toBe(
      "/uploads/media/m1/origin.jpg",
    );
  });

  it("shows a video's POSTER, not the video", () => {
    // `a.optimizedUrl ?? a.originUrl`, written inline at each call site, gets
    // this wrong and renders a 40 MB file into a 40px box.
    expect(
      mediaSrc(
        asset({
          kind: "video",
          optimizedUrl: null,
          posterUrl: "/uploads/media/m1/poster.webp",
          originUrl: "/uploads/media/m1/clip.mp4",
        }),
      ),
    ).toBe("/uploads/media/m1/poster.webp");
  });

  it("falls back to a video's origin when the poster failed", () => {
    expect(
      mediaSrc(
        asset({
          kind: "video",
          optimizedUrl: null,
          posterUrl: null,
          originUrl: "/uploads/media/m1/clip.mp4",
        }),
      ),
    ).toBe("/uploads/media/m1/clip.mp4");
  });
});

describe("primaryImageOf", () => {
  it("returns the first image in the given order", () => {
    // The list arrives in link order, which is the product's gallery order —
    // sorting here would silently ignore the operator's arrangement.
    const chosen = primaryImageOf([
      asset({ id: "b" as MediaAsset["id"] }),
      asset({ id: "a" as MediaAsset["id"] }),
    ]);
    expect(chosen?.id).toBe("b");
  });

  it("skips videos — a poster is a frame, not a chosen shot", () => {
    const chosen = primaryImageOf([
      asset({ id: "v" as MediaAsset["id"], kind: "video" }),
      asset({ id: "i" as MediaAsset["id"] }),
    ]);
    expect(chosen?.id).toBe("i");
  });

  it("returns null when there is no image at all", () => {
    expect(primaryImageOf([])).toBeNull();
    expect(primaryImageOf([asset({ kind: "video" })])).toBeNull();
  });
});

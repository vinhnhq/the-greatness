/**
 * `MediaAsset` — a file in the library.
 *
 * The thing that changed in v2: an asset has **no owner**. It exists because
 * someone uploaded it, and products link to it. That is why `productId` and
 * `position` are absent here — `position` is a property of one product's
 * gallery, and lives on the link.
 *
 * `alt` stays on the asset. It describes the picture; if the same photograph
 * needs two different descriptions on two products, the honest answer is that
 * they are two different pictures.
 */

import type { Tagged } from "type-fest";
import { z } from "zod";

import { err, ok, type Result } from "@/lib/result";

export type MediaId = Tagged<string, "MediaId">;

export type MediaKind = "image" | "video";

export const MEDIA_ALT_MAX = 200;

export interface MediaAsset {
  readonly id: MediaId;
  readonly kind: MediaKind;
  /** The bytes exactly as uploaded. Never regenerated. */
  readonly originUrl: string;
  /** The web-delivery variant, or null when keeping the origin was the better
   * outcome — see `lib/media/prepare.ts`. */
  readonly optimizedUrl: string | null;
  /** Video only: the frame used as its thumbnail. */
  readonly posterUrl: string | null;
  readonly mime: string;
  readonly bytes: number;
  readonly optimizedBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly alt: string | null;
  readonly createdAt: Date;
}

/**
 * What to render for an asset: the **origin** for an image, the poster for a
 * video.
 *
 * One function, because `a.optimizedUrl ?? a.originUrl` written at six call
 * sites is six chances to forget that a video's thumbnail is its poster and
 * to render a 40 MB file into a 40px box.
 *
 * **Why the origin and not `optimizedUrl`.** That variant is a 1600px q82
 * WebP frozen at upload time, so a 40px table thumbnail and a full-screen
 * view were sharing one file — too big for the first and too small for the
 * second. Every render site now goes through `next/image`, which derives a
 * per-breakpoint variant from the archive at request time and caches it.
 * Measured on the largest asset (2362×2362 PNG, 1.76 MB, variant 34.8 KB):
 * `w=48` → 1.2 KB, `w=256` → 8.7 KB, `w=2048` → 133 KB at full detail.
 * Smaller where it is small, sharper where it is large.
 *
 * The variants are still written and still stored; this only changes what is
 * served, which is what makes the change reversible.
 */
export const mediaSrc = (asset: MediaAsset): string =>
  asset.kind === "video"
    ? (asset.posterUrl ?? asset.originUrl)
    : asset.originUrl;

/**
 * The image a product shows in a list: the first image by position. A video is
 * never a product's thumbnail — its poster is a frame, not a chosen shot.
 */
export const primaryImageOf = (
  assets: readonly MediaAsset[],
): MediaAsset | null => assets.find((a) => a.kind === "image") ?? null;

/**
 * `z.coerce` throughout, deliberately: SQLite returns a timestamp as an ISO
 * string and an integer as a number, Postgres returns a `Date` and can return
 * a numeric as a string. Coercion is the one place that difference is
 * absorbed.
 */
const rowSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "video"]),
  originUrl: z.string().min(1),
  optimizedUrl: z.string().min(1).nullable(),
  posterUrl: z.string().min(1).nullable(),
  mime: z.string().min(1),
  bytes: z.coerce.number().int().nonnegative(),
  optimizedBytes: z.coerce.number().int().nonnegative().nullable(),
  width: z.coerce.number().int().positive().nullable(),
  height: z.coerce.number().int().positive().nullable(),
  durationMs: z.coerce.number().int().nonnegative().nullable(),
  alt: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export type ParseMediaError = {
  readonly tag: "ParseMediaError";
  readonly issues: readonly string[];
};

export const parseMediaAsset = (
  raw: unknown,
): Result<ParseMediaError, MediaAsset> => {
  const parsed = rowSchema.safeParse(raw);
  if (!parsed.success) {
    return err({
      tag: "ParseMediaError",
      issues: parsed.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    });
  }
  return ok({ ...parsed.data, id: parsed.data.id as MediaId });
};

/** Strict parser — throws on drift, because a row that does not parse means
 * the migration and `db-types.ts` disagree, which is a defect. */
export const parseMediaAssetStrict = (raw: unknown): MediaAsset => {
  const r = parseMediaAsset(raw);
  if (r.ok) return r.value;
  throw new Error(
    `parseMediaAssetStrict: schema drift — ${r.error.issues.join(", ")}`,
  );
};

/** The shape the client sends after it has uploaded the bytes. The server
 * mints the id and the timestamp; everything else is measured in the browser
 * by `lib/media/prepare.ts`. */
export type NewMediaAsset = {
  readonly kind: MediaKind;
  readonly originUrl: string;
  readonly optimizedUrl: string | null;
  readonly posterUrl: string | null;
  readonly mime: string;
  readonly bytes: number;
  readonly optimizedBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly alt: string | null;
};

/**
 * Re-encode an image into the variants the catalogue stores.
 *
 * Two of them, and the second is the one that makes big phone photographs
 * workable:
 *
 *   - **archive** — what gets stored as "the original". Capped at
 *     `ARCHIVE_MAX_EDGE` and produced *only* when the source exceeds it; below
 *     that the true file is kept, byte-identical.
 *   - **display** — what the catalogue serves. 1600px, quality 0.82.
 *
 * **One decode, both encodes.** Decoding a 48MP frame is the expensive step —
 * seconds on a phone — and calling a single-variant helper twice would pay it
 * twice. That is why this takes a *plan* rather than a fixed list: the plan
 * cannot be computed until the source dimensions are known, and they are not
 * known until after the decode.
 *
 * **Why the ops seam.** Decoding and encoding are browser calls that exist in
 * no test runner. Injecting them keeps the part that can actually be wrong —
 * which boxes we scale to, when a variant is declined — in a plain unit test,
 * and confines the untestable part to `optimize-image.browser.ts`, which
 * contains no decisions.
 */

import { err, ok, type Result } from "../result";
import { ARCHIVE_MAX_EDGE, ARCHIVE_QUALITY } from "./constraints";
import { type Box, fitWithin } from "./fit";

export const DISPLAY_MAX_EDGE = 1600;
export const DISPLAY_QUALITY = 0.82;
export const OPTIMIZED_MIME = "image/webp";

/** A decoded image, opaque to this module — only `ops` knows what it is. */
export type DecodedImage = {
  readonly width: number;
  readonly height: number;
  readonly handle: unknown;
};

export type ImageOps = {
  decode(file: Blob): Promise<DecodedImage>;
  encode(image: DecodedImage, box: Box, quality: number): Promise<Blob>;
  /** Free the decoder's resources. Optional: not every implementation has any. */
  release?(image: DecodedImage): void;
};

export type OptimizeImageError =
  | { readonly tag: "DecodeFailed"; readonly cause: unknown }
  | { readonly tag: "EncodeFailed"; readonly cause: unknown };

export type VariantSpec = {
  readonly name: "archive" | "display";
  readonly maxEdge: number;
  readonly quality: number;
};

export type EncodedVariant = {
  readonly name: VariantSpec["name"];
  readonly blob: Blob;
  readonly mime: typeof OPTIMIZED_MIME;
  readonly bytes: number;
  readonly box: Box;
};

export type EncodedImage = {
  /** The source's own dimensions, before anything was scaled. */
  readonly source: Box;
  readonly variants: readonly EncodedVariant[];
};

/**
 * Which variants to produce for a source of this size. **Pure**, so the rule
 * that decides whether a 12 MB photograph gets shrunk is a unit test rather
 * than something you find out by uploading one.
 *
 * The archive variant is skipped entirely when the source already fits: there
 * is no point re-encoding a 2000px photo to 4096px, and doing so would replace
 * a perfectly good original with a slightly worse one.
 */
export const planVariants = (source: Box): readonly VariantSpec[] => {
  const longest = Math.max(source.width, source.height);
  const display: VariantSpec = {
    name: "display",
    maxEdge: DISPLAY_MAX_EDGE,
    quality: DISPLAY_QUALITY,
  };
  return longest > ARCHIVE_MAX_EDGE
    ? [
        {
          name: "archive",
          maxEdge: ARCHIVE_MAX_EDGE,
          quality: ARCHIVE_QUALITY,
        },
        display,
      ]
    : [display];
};

export const encodeImageVariants = async (
  file: Blob,
  ops: ImageOps,
  plan: (source: Box) => readonly VariantSpec[] = planVariants,
): Promise<Result<OptimizeImageError, EncodedImage>> => {
  let image: DecodedImage;
  try {
    image = await ops.decode(file);
  } catch (cause) {
    return err({ tag: "DecodeFailed", cause });
  }

  try {
    const source = { width: image.width, height: image.height };
    const variants: EncodedVariant[] = [];
    for (const spec of plan(source)) {
      const box = fitWithin(source, spec.maxEdge);
      const blob = await ops.encode(image, box, spec.quality);
      variants.push({
        name: spec.name,
        blob,
        mime: OPTIMIZED_MIME,
        bytes: blob.size,
        box,
      });
    }
    return ok({ source, variants });
  } catch (cause) {
    return err({ tag: "EncodeFailed", cause });
  } finally {
    // Even on failure: a tab uploading twenty images otherwise leaks twenty
    // decoded bitmaps, which on a phone is the tab being killed.
    ops.release?.(image);
  }
};

/**
 * Re-encode an image to WebP, capped at a maximum edge.
 *
 * **Why the ops seam.** Decoding and encoding are three browser calls
 * (`createImageBitmap`, a canvas, `convertToBlob`) that exist in no test
 * runner. Injecting them keeps the part that can actually be wrong — which
 * box we scale to, when we decline to replace the original, what happens when
 * a decode fails — in a plain unit test, and confines the untestable part to
 * `optimize-image.browser.ts`, which contains no decisions.
 *
 * **Why WebP and not AVIF.** AVIF encodes smaller but `canvas.convertToBlob`
 * support for it is uneven, and a silent fallback to PNG would upload a file
 * several times larger than the JPEG it replaced. WebP encodes everywhere
 * this app runs.
 */

import { err, ok, type Result } from "../result";
import { type Box, fitWithin } from "./fit";

export const DEFAULT_MAX_EDGE = 1600;
export const DEFAULT_QUALITY = 0.82;
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

export type OptimizedImage = {
  readonly blob: Blob;
  readonly mime: typeof OPTIMIZED_MIME;
  readonly bytes: number;
  /** The source's dimensions, not the variant's — the row records what the
   * operator uploaded, and the variant is derivable from it. */
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  /** `false` when the re-encode came out no smaller than the original, so the
   * caller should keep the origin and store no optimized variant. */
  readonly worthKeeping: boolean;
};

export const optimizeImage = async (
  file: Blob,
  ops: ImageOps,
  options: { readonly maxEdge?: number; readonly quality?: number } = {},
): Promise<Result<OptimizeImageError, OptimizedImage>> => {
  const maxEdge = options.maxEdge ?? DEFAULT_MAX_EDGE;
  const quality = options.quality ?? DEFAULT_QUALITY;

  let image: DecodedImage;
  try {
    image = await ops.decode(file);
  } catch (cause) {
    return err({ tag: "DecodeFailed", cause });
  }

  try {
    const box = fitWithin(
      { width: image.width, height: image.height },
      maxEdge,
    );
    const blob = await ops.encode(image, box, quality);
    return ok({
      blob,
      mime: OPTIMIZED_MIME,
      bytes: blob.size,
      sourceWidth: image.width,
      sourceHeight: image.height,
      // An already-small WebP or a flat PNG of a logo routinely re-encodes
      // *larger*. Storing that as "optimized" would mean every page load
      // paying for the privilege.
      worthKeeping: blob.size > 0 && blob.size < file.size,
    });
  } catch (cause) {
    return err({ tag: "EncodeFailed", cause });
  } finally {
    ops.release?.(image);
  }
};

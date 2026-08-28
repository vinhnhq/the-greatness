/**
 * Fit a source box inside a square bound, preserving aspect ratio.
 *
 * Split out of the encoder for one reason: it is the only part of image
 * optimization that can be wrong in a way a screenshot will not show you. An
 * off-by-one in the rounding produces a 1601px image, and a missing
 * never-upscale guard turns a 40×40 icon into a blurry 1600×1600 upload that
 * is larger than the original it was meant to replace.
 */

export type Box = { readonly width: number; readonly height: number };

/**
 * `fitWithin({width, height}, maxEdge)` — the target box, never larger than
 * the source (an image smaller than the bound is returned unchanged) and
 * never smaller than 1px on either side.
 *
 * A non-finite or non-positive source is returned as 1×1 rather than throwing:
 * the caller is a canvas about to be sized, and a thrown error there costs the
 * whole upload for a value the browser produced.
 */
export const fitWithin = (source: Box, maxEdge: number): Box => {
  const { width, height } = source;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return { width: 1, height: 1 };
  }
  if (!Number.isFinite(maxEdge) || maxEdge <= 0) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const longest = Math.max(width, height);
  // Never upscale — enlarging costs bytes and adds no detail.
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

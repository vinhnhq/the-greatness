/**
 * The DOM half of image optimization: `createImageBitmap`, a canvas, and
 * `convertToBlob`.
 *
 * Split into its own file because it is the part a Node test cannot reach.
 * **No decisions live here** — if an `if` appears in this file, it belongs in
 * `optimizeImage`, where a test can drive it. Keeping that rule enforceable is
 * why the split is a file boundary rather than a comment: this module is
 * excluded from coverage, so anything that moves into it stops being measured.
 */

import type { ImageOps } from "./optimize-image";
import { OPTIMIZED_MIME } from "./optimize-image";

export const browserImageOps: ImageOps = {
  decode: async (file) => {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, handle: bitmap };
  },
  encode: async (image, box, quality) => {
    const canvas = new OffscreenCanvas(box.width, box.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d canvas context unavailable");
    ctx.drawImage(image.handle as ImageBitmap, 0, 0, box.width, box.height);
    return canvas.convertToBlob({ type: OPTIMIZED_MIME, quality });
  },
  release: (image) => {
    (image.handle as ImageBitmap).close();
  },
};

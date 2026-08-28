/**
 * Storage keys for a product's attachments.
 *
 * Two properties matter and neither is cosmetic:
 *
 *   - **The key cannot escape its prefix.** The local storage driver joins
 *     this onto a directory path, so a filename containing `../` would write
 *     outside `.data/uploads`. Sanitising here means the driver has one thing
 *     to trust rather than every caller.
 *   - **Two files uploaded a second apart cannot collide.** The id, not the
 *     filename, carries uniqueness; the readable stem survives only as a
 *     human affordance when someone is staring at a storage bucket.
 */

/** Filename characters that survive. Everything else becomes `-`. */
const UNSAFE = /[^a-zA-Z0-9._-]+/g;

/** MIME → extension for the variants this app writes. */
const EXTENSION: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

export const extensionFor = (mime: string): string =>
  EXTENSION[mime.toLowerCase().split(";")[0].trim()] ?? "bin";

/**
 * The readable half of a key: the original filename with its extension and
 * anything path-like removed, lowercased, capped, never empty.
 */
export const safeStem = (filename: string): string => {
  const base = filename.split(/[/\\]/).pop() ?? "";
  const withoutExt = base.replace(/\.[^.]*$/, "");
  const cleaned = withoutExt
    .normalize("NFKD")
    // Strip combining marks so "Áo dài" becomes "Ao-dai" rather than a run of
    // dashes — the stem exists to be recognised in a bucket listing.
    .replace(/[̀-ͯ]/g, "")
    .replace(UNSAFE, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .toLowerCase()
    .slice(0, 48)
    .replace(/-+$/, "");
  return cleaned || "file";
};

export type MediaKeys = {
  readonly origin: string;
  readonly optimized: string;
  readonly poster: string;
};

/**
 * The three keys one asset can occupy. `optimized` and `poster` are always
 * computed, even for a file that ends up with neither — an unused key costs
 * nothing, and computing them lazily meant two call sites deriving the same
 * string slightly differently.
 *
 * Filed under `media/<id>/`, not `products/<productId>/<id>/`. An asset in the
 * library has no owner, so there is no product to file it under — and one
 * asset used by three products cannot live in three directories. Keys written
 * under the old shape keep resolving; both are just strings to the serving
 * route.
 */
export const mediaKeys = (input: {
  readonly mediaId: string;
  readonly filename: string;
  readonly mime: string;
}): MediaKeys => {
  const stem = safeStem(input.filename);
  const dir = `media/${input.mediaId}`;
  return {
    origin: `${dir}/origin-${stem}.${extensionFor(input.mime)}`,
    optimized: `${dir}/optimized-${stem}.webp`,
    poster: `${dir}/poster-${stem}.webp`,
  };
};

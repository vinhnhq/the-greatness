/**
 * What the uploader accepts, and what it calls things.
 *
 * This module is the single source of truth for the allow-list and the size
 * caps, shared by three callers that must agree: the client pre-flight check,
 * the Vercel Blob token route, and the local storage writer. When they drift,
 * the failure is a file that uploads and is then rejected — after the user
 * has waited for 80 MB to travel.
 *
 * Errors are **codes, not prose**. This module cannot know how the caller
 * renders a message (a toast, a field error, a server log), so it names the
 * condition and the render site owns the wording.
 */

export type MediaKind = "image" | "video";

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

/**
 * Types that are stored exactly as uploaded, with no derived variant.
 *
 * GIF is here because a canvas re-encode keeps **one frame**. An animated GIF
 * would arrive in the catalogue as a still, and nothing in the UI could say
 * why — the file looks fine, it just stopped moving. Not optimizing it is the
 * honest outcome.
 *
 * HEIC is deliberately absent from the allow-list entirely rather than listed
 * here: no browser but Safari can decode it, and iOS converts HEIC to JPEG on
 * its way through a file input, so the practical path already works.
 */
export const NEVER_RE_ENCODE = ["image/gif"] as const;

export const shouldReEncode = (mime: string): boolean =>
  !(NEVER_RE_ENCODE as readonly string[]).includes(
    mime.toLowerCase().split(";")[0].trim(),
  );

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const ALLOWED_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
] as const;

/**
 * The image ceiling is 25 MB, not 8.
 *
 * A phone photograph is routinely larger than 8 MB — an iPhone 48MP JPEG is
 * 10–15 MB and a 200MP Android frame can pass 25 — and the first version of
 * this rejected all of them **before the optimizer ever saw the file**. The
 * optimizer exists precisely to handle files that size; a gate in front of it
 * that turns them away is the tail wagging the dog.
 *
 * 25 MB is where the ceiling stops being about quality and starts being about
 * someone having picked the wrong file. `ARCHIVE_MAX_EDGE` is what keeps the
 * stored bytes reasonable at that size.
 */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
/** The larger of the two — what a token route has to allow at minimum. */
export const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES;

/**
 * The stored original is capped at 4096px on its longest edge.
 *
 * Above that, "the original" is a high-quality re-encode rather than the
 * literal file. That is a real trade — the pixels past 4096 are gone — made
 * deliberately: a 48MP frame is 12 MB to upload and 12 MB to keep forever, and
 * nothing a catalogue does with a product photo needs more than 4096px. A
 * source at or below the cap is stored **byte-identical**.
 *
 * Quality 0.92 rather than the display variant's 0.82: this copy is what any
 * future size gets re-derived from, so its artefacts would compound.
 */
export const ARCHIVE_MAX_EDGE = 4096;
export const ARCHIVE_QUALITY = 0.92;

/** How many assets one product's gallery may carry. Not a storage limit: past
 * roughly this many, the reorder grid stops being usable. */
export const MAX_ATTACHMENTS_PER_PRODUCT = 20;

/** The kind a MIME type belongs to, or `null` when it is not accepted. */
export const kindOf = (mime: string): MediaKind | null => {
  const type = mime.toLowerCase().split(";")[0].trim();
  if ((ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) return "image";
  if ((ALLOWED_VIDEO_TYPES as readonly string[]).includes(type)) return "video";
  return null;
};

export const maxBytesFor = (kind: MediaKind): number =>
  kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;

export type MediaRejection =
  | { readonly tag: "UnsupportedType"; readonly mime: string }
  | { readonly tag: "TooLarge"; readonly bytes: number; readonly limit: number }
  | { readonly tag: "Empty" };

export type MediaAccepted = {
  readonly kind: MediaKind;
  readonly mime: string;
};

/**
 * The pre-flight check, run before a single byte leaves the browser.
 *
 * Takes only the two fields it needs rather than a `File`, so it is testable
 * in a plain Node unit test — the DOM `File` constructor is not the subject.
 */
export const validateFile = (file: {
  readonly type: string;
  readonly size: number;
}):
  | { readonly ok: true; readonly value: MediaAccepted }
  | {
      readonly ok: false;
      readonly error: MediaRejection;
    } => {
  const mime = file.type.toLowerCase().split(";")[0].trim();
  const kind = kindOf(mime);
  if (!kind) return { ok: false, error: { tag: "UnsupportedType", mime } };
  if (file.size <= 0) return { ok: false, error: { tag: "Empty" } };
  const limit = maxBytesFor(kind);
  if (file.size > limit) {
    return { ok: false, error: { tag: "TooLarge", bytes: file.size, limit } };
  }
  return { ok: true, value: { kind, mime } };
};

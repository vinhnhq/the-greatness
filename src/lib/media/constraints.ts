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

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const ALLOWED_MEDIA_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_VIDEO_TYPES,
] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB
/** The larger of the two — what a token route has to allow at minimum. */
export const MAX_UPLOAD_BYTES = MAX_VIDEO_BYTES;

/** How many attachments one product may carry. Not a storage limit: past
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

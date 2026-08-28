/**
 * The one entry point the upload UI calls: a picked `File` in, everything that
 * will be stored out.
 *
 * The rule this module enforces is the one that matters to an operator with
 * ten photographs selected: **past validation, the origin always survives**.
 * A failed decode, an unavailable canvas, a video whose poster cannot be
 * grabbed — each degrades to "origin only" with a note, never to a lost
 * upload. One bad file must not cost the nine that were fine.
 *
 * **What "origin" means for a large photograph.** Above `ARCHIVE_MAX_EDGE` it
 * is a high-quality re-encode rather than the literal file: a 48MP frame is
 * 12 MB to upload and 12 MB to keep forever, and nothing a catalogue does with
 * a product photo needs more than 4096px. At or below the cap the true bytes
 * are stored untouched, and `origin-resized` is reported so the UI can say
 * which happened rather than leaving someone to wonder.
 */

import { err, ok, type Result } from "../result";
import {
  type MediaRejection,
  shouldReEncode,
  validateFile,
} from "./constraints";
import {
  encodeImageVariants,
  type EncodedVariant,
  type ImageOps,
} from "./optimize-image";
import { browserImageOps } from "./optimize-image.browser";
import type { PreparedMedia } from "./types";
import { capturePoster, type VideoOps } from "./video-poster";
import { browserVideoOps } from "./video-poster.browser";

/** Why a prepared file lacks a variant, or is not the file that was picked.
 * Not errors — the upload proceeds — but worth saying rather than swallowing. */
export type PrepareNote =
  | "image-decode-failed"
  | "image-encode-failed"
  | "optimized-not-smaller"
  /** The stored original is a 4096px re-encode, not the picked file. */
  | "origin-resized"
  /** An animated GIF: re-encoding would keep one frame, so nothing was. */
  | "not-re-encoded"
  | "video-probe-failed"
  | "video-poster-failed";

export type PrepareResult = {
  readonly media: PreparedMedia;
  readonly notes: readonly PrepareNote[];
};

export type PrepareOps = {
  readonly image: ImageOps;
  readonly video: VideoOps;
};

export const browserPrepareOps: PrepareOps = {
  image: browserImageOps,
  video: browserVideoOps,
};

export const prepare = async (
  file: File,
  ops: PrepareOps = browserPrepareOps,
): Promise<Result<MediaRejection, PrepareResult>> => {
  const validation = validateFile(file);
  if (!validation.ok) return err(validation.error);
  const { kind, mime } = validation.value;

  /** The picked file, stored as-is. The fallback for every degradation. */
  const trueOrigin = {
    blob: file as Blob,
    mime,
    bytes: file.size,
    filename: file.name,
  };

  const originOnly = (notes: readonly PrepareNote[]): PrepareResult => ({
    media: {
      kind,
      origin: trueOrigin,
      optimized: null,
      poster: null,
      width: null,
      height: null,
      durationMs: null,
    },
    notes,
  });

  if (kind === "video") return ok(await prepareVideo(file, ops, originOnly));

  // An animated GIF re-encodes to a single frame, so it is stored whole.
  if (!shouldReEncode(mime)) return ok(originOnly(["not-re-encoded"]));

  const encoded = await encodeImageVariants(file, ops.image);
  if (!encoded.ok) {
    return ok(
      originOnly([
        encoded.error.tag === "DecodeFailed"
          ? "image-decode-failed"
          : "image-encode-failed",
      ]),
    );
  }

  const { source, variants } = encoded.value;
  const notes: PrepareNote[] = [];
  const byName = (name: EncodedVariant["name"]) =>
    variants.find((v) => v.name === name);

  // The archive variant is only produced when the source exceeded the cap,
  // and is only *used* when it actually came out smaller. A re-encode that
  // grew would be strictly worse than the file it replaced.
  const archive = byName("archive");
  const useArchive = archive !== undefined && archive.bytes < file.size;
  if (useArchive) notes.push("origin-resized");

  const origin = useArchive
    ? {
        blob: archive.blob,
        mime: archive.mime,
        bytes: archive.bytes,
        filename: file.name,
      }
    : trueOrigin;

  // Dimensions describe the **stored** file, not the picked one. Recording
  // 8064×6048 for a 4096px file would be a caption that contradicts the
  // bytes behind it.
  const stored = useArchive ? archive.box : source;

  const display = byName("display");
  // A flat PNG logo, or an AVIF that was already efficient, routinely
  // re-encodes larger. Storing that as "optimized" would make every page load
  // pay for the privilege.
  const worthKeeping =
    display !== undefined && display.bytes > 0 && display.bytes < origin.bytes;
  if (display !== undefined && !worthKeeping)
    notes.push("optimized-not-smaller");

  return ok({
    media: {
      kind,
      origin,
      optimized:
        display !== undefined && worthKeeping
          ? { blob: display.blob, mime: display.mime, bytes: display.bytes }
          : null,
      poster: null,
      width: stored.width,
      height: stored.height,
      durationMs: null,
    },
    notes,
  });
};

const prepareVideo = async (
  file: File,
  ops: PrepareOps,
  originOnly: (notes: readonly PrepareNote[]) => PrepareResult,
): Promise<PrepareResult> => {
  const poster = await capturePoster(file, ops.video);
  if (!poster.ok) {
    return originOnly([
      poster.error.tag === "ProbeFailed"
        ? "video-probe-failed"
        : "video-poster-failed",
    ]);
  }

  const p = poster.value;
  const base = originOnly([]);
  return {
    notes: [],
    media: {
      ...base.media,
      // v1 does not transcode video — the bytes go up as chosen.
      poster: { blob: p.blob, mime: p.mime, bytes: p.bytes },
      width: p.meta.width,
      height: p.meta.height,
      durationMs: p.meta.durationMs,
    },
  };
};

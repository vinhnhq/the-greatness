/**
 * The one entry point the upload UI calls: a `File` in, everything that will
 * be stored out.
 *
 * The rule this module enforces is the one that matters to an operator with
 * ten files selected: **the origin always survives**. Validation rejects a
 * file outright, but once a file is accepted, nothing downstream — a decode
 * that fails, a canvas the browser will not give us, a re-encode that comes
 * out larger — is allowed to turn into a lost upload. Every one of those
 * degrades to "origin only" and reports itself in `notes` so the UI can say
 * what happened without treating it as an error.
 */

import { err, ok, type Result } from "../result";
import { type MediaRejection, validateFile } from "./constraints";
import {
  browserImageOps,
  type ImageOps,
  optimizeImage,
} from "./optimize-image";
import type { PreparedMedia } from "./types";
import { browserVideoOps, capturePoster, type VideoOps } from "./video-poster";

/** Why a prepared file has no optimized variant or no poster. Not errors —
 * the upload proceeds — but worth surfacing rather than swallowing. */
export type PrepareNote =
  | "image-decode-failed"
  | "image-encode-failed"
  | "optimized-not-smaller"
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
  options: { readonly maxEdge?: number; readonly quality?: number } = {},
): Promise<Result<MediaRejection, PrepareResult>> => {
  const validation = validateFile(file);
  if (!validation.ok) return err(validation.error);
  const { kind, mime } = validation.value;

  const origin = {
    blob: file as Blob,
    mime,
    bytes: file.size,
    filename: file.name,
  };
  const notes: PrepareNote[] = [];

  if (kind === "image") {
    const optimized = await optimizeImage(file, ops.image, options);
    if (!optimized.ok) {
      notes.push(
        optimized.error.tag === "DecodeFailed"
          ? "image-decode-failed"
          : "image-encode-failed",
      );
      return ok({
        media: {
          kind,
          origin,
          optimized: null,
          poster: null,
          width: null,
          height: null,
          durationMs: null,
        },
        notes,
      });
    }

    const v = optimized.value;
    if (!v.worthKeeping) notes.push("optimized-not-smaller");
    return ok({
      media: {
        kind,
        origin,
        optimized: v.worthKeeping
          ? { blob: v.blob, mime: v.mime, bytes: v.bytes }
          : null,
        poster: null,
        width: v.sourceWidth,
        height: v.sourceHeight,
        durationMs: null,
      },
      notes,
    });
  }

  const poster = await capturePoster(file, ops.video);
  if (!poster.ok) {
    notes.push(
      poster.error.tag === "ProbeFailed"
        ? "video-probe-failed"
        : "video-poster-failed",
    );
    return ok({
      media: {
        kind,
        origin,
        optimized: null,
        poster: null,
        width: null,
        height: null,
        durationMs: null,
      },
      notes,
    });
  }

  const p = poster.value;
  return ok({
    media: {
      kind,
      origin,
      // v1 stores video bytes as uploaded — see the spec's open question.
      optimized: null,
      poster: { blob: p.blob, mime: p.mime, bytes: p.bytes },
      width: p.meta.width,
      height: p.meta.height,
      durationMs: p.meta.durationMs,
    },
    notes,
  });
};

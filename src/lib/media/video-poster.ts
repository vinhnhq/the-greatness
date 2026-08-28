/**
 * Grab a still from a video to use as its thumbnail.
 *
 * v1 does not transcode video — that needs `ffmpeg` on a server and its own
 * decision. What it does need is something to *show* in a grid of thumbnails,
 * because the alternative is a black rectangle where every video looks
 * identical.
 *
 * A missing poster is never fatal. The video still uploads; the grid shows a
 * play icon. Failing the whole file because a frame could not be decoded
 * would be trading the thing the operator asked for against a nicety.
 */

import { err, ok, type Result } from "../result";
import { type Box, fitWithin } from "./fit";
import { OPTIMIZED_MIME } from "./optimize-image";

export const DEFAULT_POSTER_MAX_EDGE = 800;
/** Roughly a second in: past the fade-from-black most clips open with, and
 * before anything interesting has usually happened. */
const PREFERRED_POSTER_MS = 1_000;

export type VideoMeta = {
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
};

export type VideoOps = {
  probe(file: Blob): Promise<VideoMeta>;
  grab(file: Blob, atMs: number, box: Box): Promise<Blob>;
};

export type PosterError =
  | { readonly tag: "ProbeFailed"; readonly cause: unknown }
  | { readonly tag: "GrabFailed"; readonly cause: unknown };

export type CapturedPoster = {
  readonly blob: Blob;
  readonly mime: typeof OPTIMIZED_MIME;
  readonly bytes: number;
  readonly meta: VideoMeta;
};

/**
 * Which millisecond to seek to. Pure, because the clamping is the part that
 * breaks: seeking past the end of a 400ms clip leaves most decoders parked at
 * `readyState` 1 forever, and the upload hangs rather than fails.
 */
export const posterTimeMs = (durationMs: number): number => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0;
  if (durationMs <= PREFERRED_POSTER_MS) {
    // A short clip gets a frame a tenth of the way in — still past the fade,
    // and comfortably inside the clip.
    return Math.max(0, Math.floor(durationMs * 0.1));
  }
  return PREFERRED_POSTER_MS;
};

export const capturePoster = async (
  file: Blob,
  ops: VideoOps,
  options: { readonly maxEdge?: number } = {},
): Promise<Result<PosterError, CapturedPoster>> => {
  let meta: VideoMeta;
  try {
    meta = await ops.probe(file);
  } catch (cause) {
    return err({ tag: "ProbeFailed", cause });
  }

  try {
    const box = fitWithin(
      { width: meta.width, height: meta.height },
      options.maxEdge ?? DEFAULT_POSTER_MAX_EDGE,
    );
    const blob = await ops.grab(file, posterTimeMs(meta.durationMs), box);
    return ok({ blob, mime: OPTIMIZED_MIME, bytes: blob.size, meta });
  } catch (cause) {
    return err({ tag: "GrabFailed", cause });
  }
};

/** How long to wait on a decoder before giving up and shipping no poster. */
const DECODE_TIMEOUT_MS = 10_000;

const loadVideo = (file: Blob): Promise<HTMLVideoElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    // Safari refuses to decode frames for a video it considers "not playing"
    // unless it is allowed to play inline.
    video.playsInline = true;
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      reject(new Error("video metadata timed out"));
    }, DECODE_TIMEOUT_MS);
    video.addEventListener(
      "loadedmetadata",
      () => {
        clearTimeout(timer);
        resolve(video);
      },
      { once: true },
    );
    video.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
        reject(new Error("video could not be decoded"));
      },
      { once: true },
    );
    video.src = url;
  });

const seek = (video: HTMLVideoElement, atMs: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("video seek timed out")),
      DECODE_TIMEOUT_MS,
    );
    video.addEventListener(
      "seeked",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    video.currentTime = atMs / 1000;
  });

/** The browser implementation. As with `browserImageOps`, it holds no
 * decisions — only the DOM dance. */
export const browserVideoOps: VideoOps = {
  probe: async (file) => {
    const video = await loadVideo(file);
    const meta: VideoMeta = {
      width: video.videoWidth,
      height: video.videoHeight,
      // A stream with no duration header reports Infinity; the caller's
      // clamping treats that as "unknown" and seeks to 0.
      durationMs: Number.isFinite(video.duration)
        ? Math.round(video.duration * 1000)
        : 0,
    };
    URL.revokeObjectURL(video.src);
    return meta;
  },
  grab: async (file, atMs, box) => {
    const video = await loadVideo(file);
    try {
      await seek(video, atMs);
      const canvas = new OffscreenCanvas(box.width, box.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2d canvas context unavailable");
      ctx.drawImage(video, 0, 0, box.width, box.height);
      return await canvas.convertToBlob({ type: OPTIMIZED_MIME, quality: 0.8 });
    } finally {
      URL.revokeObjectURL(video.src);
      video.removeAttribute("src");
      video.load();
    }
  },
};

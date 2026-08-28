/**
 * The DOM half of poster capture: load a video, seek it, draw the frame.
 *
 * Split out for the same reason as `optimize-image.browser.ts` — a Node test
 * cannot reach `HTMLVideoElement`, and mocking it would test the mock. The
 * decisions (which millisecond to seek to, what a failure degrades to) live in
 * `video-poster.ts`, where they are tested.
 *
 * The two timeouts are the load-bearing part. A decoder handed a stream it
 * cannot read does not error — it sits at `readyState` 1 forever, and without
 * a timeout the upload hangs rather than failing, which is strictly worse.
 */

import { OPTIMIZED_MIME } from "./optimize-image";
import type { VideoOps } from "./video-poster";

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

export const browserVideoOps: VideoOps = {
  probe: async (file) => {
    const video = await loadVideo(file);
    const meta = {
      width: video.videoWidth,
      height: video.videoHeight,
      // A stream with no duration header reports Infinity; the caller's
      // clamping treats that as "unknown" and seeks to frame zero.
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

/**
 * `prepare()` is the module that decides what an operator loses when
 * something goes wrong. These tests are written around one invariant: past
 * validation, **the origin always survives**. Every degradation below returns
 * `ok` with a note, never an error.
 */

import { describe, expect, it, vi } from "vitest";

import type { PrepareOps } from "@/lib/media/prepare";
import { prepare } from "@/lib/media/prepare";

const fileOf = (name: string, type: string, bytes: number): File =>
  new File([new Uint8Array(bytes)], name, { type });

const blobOf = (bytes: number): Blob => new Blob([new Uint8Array(bytes)]);

const opsWith = (overrides: Partial<PrepareOps> = {}): PrepareOps => ({
  image: {
    decode: async () => ({ width: 3000, height: 2000, handle: null }),
    encode: async () => blobOf(50_000),
    ...overrides.image,
  },
  video: {
    probe: async () => ({ width: 1920, height: 1080, durationMs: 8_000 }),
    grab: async () => blobOf(9_000),
    ...overrides.video,
  },
});

describe("prepare — validation", () => {
  it("rejects an unsupported type before touching a decoder", async () => {
    const decode = vi.fn();
    const r = await prepare(
      fileOf("spec.pdf", "application/pdf", 1_000),
      opsWith({
        image: {
          decode,
          encode: async () => blobOf(1),
        },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("UnsupportedType");
    expect(decode).not.toHaveBeenCalled();
  });

  it("rejects an oversize image", async () => {
    const r = await prepare(
      fileOf("huge.png", "image/png", 20 * 1024 * 1024),
      opsWith(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("TooLarge");
  });
});

describe("prepare — images", () => {
  it("returns origin plus a smaller optimized variant and the source size", async () => {
    const r = await prepare(
      fileOf("Tote Bag.jpeg", "image/jpeg", 900_000),
      opsWith(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const { media, notes } = r.value;
    expect(notes).toEqual([]);
    expect(media.kind).toBe("image");
    expect(media.origin.filename).toBe("Tote Bag.jpeg");
    expect(media.origin.bytes).toBe(900_000);
    expect(media.optimized).toEqual({
      blob: expect.anything(),
      mime: "image/webp",
      bytes: 50_000,
    });
    expect(media.width).toBe(3000);
    expect(media.height).toBe(2000);
    expect(media.poster).toBeNull();
    expect(media.durationMs).toBeNull();
  });

  it("keeps the origin and drops the variant when the re-encode is bigger", async () => {
    const r = await prepare(
      fileOf("logo.png", "image/png", 4_000),
      opsWith({
        image: {
          decode: async () => ({ width: 200, height: 200, handle: null }),
          encode: async () => blobOf(9_000),
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.media.optimized).toBeNull();
    expect(r.value.notes).toEqual(["optimized-not-smaller"]);
    // The dimensions were still learned, so the row is not degraded.
    expect(r.value.media.width).toBe(200);
  });

  it("still uploads the origin when the decode fails", async () => {
    const r = await prepare(
      fileOf("corrupt.jpg", "image/jpeg", 1_000),
      opsWith({
        image: {
          decode: async () => {
            throw new Error("not an image");
          },
          encode: async () => blobOf(1),
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.media.origin.bytes).toBe(1_000);
    expect(r.value.media.optimized).toBeNull();
    expect(r.value.notes).toEqual(["image-decode-failed"]);
  });

  it("still uploads the origin when the canvas is unavailable", async () => {
    const r = await prepare(
      fileOf("photo.jpg", "image/jpeg", 1_000),
      opsWith({
        image: {
          decode: async () => ({ width: 100, height: 100, handle: null }),
          encode: async () => {
            throw new Error("no OffscreenCanvas");
          },
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.media.optimized).toBeNull();
    expect(r.value.notes).toEqual(["image-encode-failed"]);
  });
});

describe("prepare — video", () => {
  it("returns origin plus a poster and the clip's metadata", async () => {
    const r = await prepare(
      fileOf("demo.mp4", "video/mp4", 40 * 1024 * 1024),
      opsWith(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const { media, notes } = r.value;
    expect(notes).toEqual([]);
    expect(media.kind).toBe("video");
    // v1 does not transcode — the bytes go up as chosen.
    expect(media.optimized).toBeNull();
    expect(media.poster?.mime).toBe("image/webp");
    expect(media.durationMs).toBe(8_000);
    expect(media.width).toBe(1920);
  });

  it("uploads a video whose poster could not be grabbed", async () => {
    // A missing thumbnail is a cosmetic loss. Failing the file would throw
    // away a 40 MB upload the operator already waited for.
    const r = await prepare(
      fileOf("weird.mov", "video/quicktime", 5_000_000),
      opsWith({
        video: {
          probe: async () => ({ width: 640, height: 480, durationMs: 3_000 }),
          grab: async () => {
            throw new Error("seek timed out");
          },
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.media.poster).toBeNull();
    expect(r.value.media.origin.bytes).toBe(5_000_000);
    expect(r.value.notes).toEqual(["video-poster-failed"]);
  });

  it("uploads a video whose metadata could not be probed", async () => {
    const r = await prepare(
      fileOf("nocodec.webm", "video/webm", 1_000_000),
      opsWith({
        video: {
          probe: async () => {
            throw new Error("no codec");
          },
          grab: async () => blobOf(1),
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.notes).toEqual(["video-probe-failed"]);
    expect(r.value.media.durationMs).toBeNull();
  });
});

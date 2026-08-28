/**
 * The image and video pipelines through their injected seams — no DOM, no
 * canvas, no `createImageBitmap`. What is under test is the decision-making:
 * which box we scale to, when we decline to keep a re-encode, and that a
 * failure anywhere becomes a tagged value rather than an exception escaping
 * into a `for` loop over ten files.
 */

import { describe, expect, it, vi } from "vitest";

import type { Box } from "@/lib/media/fit";
import {
  DEFAULT_MAX_EDGE,
  type ImageOps,
  optimizeImage,
} from "@/lib/media/optimize-image";
import {
  capturePoster,
  posterTimeMs,
  type VideoOps,
} from "@/lib/media/video-poster";

const blobOf = (bytes: number): Blob =>
  new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" });

const imageOps = (
  source: Box,
  encodedBytes: number,
): ImageOps & { readonly encode: ReturnType<typeof vi.fn> } => {
  const encode = vi.fn(async () => blobOf(encodedBytes));
  return {
    decode: async () => ({ ...source, handle: "bitmap" }),
    encode,
    release: vi.fn(),
  };
};

describe("optimizeImage", () => {
  it("encodes into the fitted box, not the source box", async () => {
    const ops = imageOps({ width: 4000, height: 2000 }, 10);
    await optimizeImage(blobOf(1_000), ops);
    expect(ops.encode).toHaveBeenCalledWith(
      expect.anything(),
      { width: DEFAULT_MAX_EDGE, height: 800 },
      expect.any(Number),
    );
  });

  it("reports the SOURCE dimensions, not the variant's", async () => {
    // The row records what the operator uploaded; the variant's size is
    // derivable from it and the max edge.
    const ops = imageOps({ width: 4000, height: 2000 }, 10);
    const r = await optimizeImage(blobOf(1_000), ops);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.sourceWidth).toBe(4000);
      expect(r.value.sourceHeight).toBe(2000);
    }
  });

  it("marks a re-encode that came out larger as not worth keeping", async () => {
    // A flat PNG logo routinely re-encodes bigger. Storing that would make
    // every page load pay for the "optimization".
    const r = await optimizeImage(
      blobOf(1_000),
      imageOps({ width: 100, height: 100 }, 4_000),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.worthKeeping).toBe(false);
  });

  it("marks an equal-size re-encode as not worth keeping either", async () => {
    const r = await optimizeImage(
      blobOf(1_000),
      imageOps({ width: 100, height: 100 }, 1_000),
    );
    if (r.ok) expect(r.value.worthKeeping).toBe(false);
  });

  it("keeps a genuinely smaller re-encode", async () => {
    const r = await optimizeImage(
      blobOf(1_000_000),
      imageOps({ width: 4000, height: 3000 }, 120_000),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.worthKeeping).toBe(true);
      expect(r.value.mime).toBe("image/webp");
      expect(r.value.bytes).toBe(120_000);
    }
  });

  it("returns DecodeFailed rather than throwing", async () => {
    const ops: ImageOps = {
      decode: async () => {
        throw new Error("not an image");
      },
      encode: async () => blobOf(1),
    };
    const r = await optimizeImage(blobOf(10), ops);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("DecodeFailed");
  });

  it("returns EncodeFailed rather than throwing", async () => {
    const ops: ImageOps = {
      decode: async () => ({ width: 10, height: 10, handle: null }),
      encode: async () => {
        throw new Error("no canvas");
      },
    };
    const r = await optimizeImage(blobOf(10), ops);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("EncodeFailed");
  });

  it("releases the decoded image even when the encode throws", async () => {
    // Without this, a browser tab uploading twenty images leaks twenty
    // decoded bitmaps — which on a phone is the tab being killed.
    const release = vi.fn();
    const ops: ImageOps = {
      decode: async () => ({ width: 10, height: 10, handle: null }),
      encode: async () => {
        throw new Error("no canvas");
      },
      release,
    };
    await optimizeImage(blobOf(10), ops);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("honours an explicit max edge and quality", async () => {
    const ops = imageOps({ width: 2000, height: 1000 }, 10);
    await optimizeImage(blobOf(1_000), ops, { maxEdge: 400, quality: 0.5 });
    expect(ops.encode).toHaveBeenCalledWith(
      expect.anything(),
      { width: 400, height: 200 },
      0.5,
    );
  });
});

describe("posterTimeMs", () => {
  it("prefers one second in for an ordinary clip", () => {
    expect(posterTimeMs(30_000)).toBe(1_000);
  });

  it("clamps inside a short clip rather than seeking past its end", () => {
    // Seeking past the end leaves most decoders parked forever, so the upload
    // hangs instead of failing — the worst of both.
    expect(posterTimeMs(400)).toBe(40);
    expect(posterTimeMs(1_000)).toBe(100);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "falls back to frame zero for an unusable duration (%s)",
    (duration) => {
      expect(posterTimeMs(duration)).toBe(0);
    },
  );
});

describe("capturePoster", () => {
  const meta = { width: 1920, height: 1080, durationMs: 12_000 };

  it("grabs the clamped frame scaled into the poster box", async () => {
    const grab = vi.fn(async () => blobOf(5_000));
    const ops: VideoOps = { probe: async () => meta, grab };
    const r = await capturePoster(blobOf(50_000_000), ops);

    expect(r.ok).toBe(true);
    expect(grab).toHaveBeenCalledWith(expect.anything(), 1_000, {
      width: 800,
      height: 450,
    });
    if (r.ok) expect(r.value.meta).toEqual(meta);
  });

  it("returns ProbeFailed rather than throwing", async () => {
    const ops: VideoOps = {
      probe: async () => {
        throw new Error("no codec");
      },
      grab: async () => blobOf(1),
    };
    const r = await capturePoster(blobOf(10), ops);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("ProbeFailed");
  });

  it("returns GrabFailed rather than throwing", async () => {
    const ops: VideoOps = {
      probe: async () => meta,
      grab: async () => {
        throw new Error("seek timed out");
      },
    };
    const r = await capturePoster(blobOf(10), ops);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("GrabFailed");
  });
});

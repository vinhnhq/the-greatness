/**
 * The image and video pipelines through their injected seams — no DOM, no
 * canvas, no `createImageBitmap`. What is under test is the decision-making:
 * which variants get produced for a source of a given size, which box each is
 * scaled to, and that a failure anywhere becomes a tagged value rather than an
 * exception escaping into a loop over ten files.
 */

import { describe, expect, it, vi } from "vitest";

import { ARCHIVE_MAX_EDGE } from "@/lib/media/constraints";
import type { Box } from "@/lib/media/fit";
import {
  DISPLAY_MAX_EDGE,
  encodeImageVariants,
  type ImageOps,
  planVariants,
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
  encodedBytes: number | ((box: Box) => number) = 10,
) => {
  const encode = vi.fn(async (_image: unknown, box: Box) =>
    blobOf(typeof encodedBytes === "number" ? encodedBytes : encodedBytes(box)),
  );
  const ops = {
    decode: async () => ({ ...source, handle: "bitmap" }),
    encode,
    release: vi.fn(),
  };
  return ops as unknown as ImageOps & { readonly encode: typeof encode };
};

describe("planVariants", () => {
  it("produces only a display variant for a source inside the archive cap", () => {
    // Re-encoding a 2000px photo to 4096px would replace a perfectly good
    // original with a slightly worse one, for no saving at all.
    const plan = planVariants({ width: 3024, height: 4032 });
    expect(plan.map((v) => v.name)).toEqual(["display"]);
  });

  it("adds an archive variant once the source exceeds the cap", () => {
    // A 48MP phone frame: 12 MB to upload and 12 MB to keep forever.
    const plan = planVariants({ width: 8064, height: 6048 });
    expect(plan.map((v) => v.name)).toEqual(["archive", "display"]);
  });

  it("treats exactly the cap as inside it", () => {
    expect(
      planVariants({ width: ARCHIVE_MAX_EDGE, height: 100 }).map((v) => v.name),
    ).toEqual(["display"]);
    expect(
      planVariants({ width: ARCHIVE_MAX_EDGE + 1, height: 100 }).map(
        (v) => v.name,
      ),
    ).toEqual(["archive", "display"]);
  });

  it("measures the LONGEST edge, whichever way the photo is turned", () => {
    // A portrait 6048×8064 is the same photograph rotated; it must not slip
    // past a cap that only looked at width.
    expect(
      planVariants({ width: 3000, height: 8064 }).map((v) => v.name),
    ).toEqual(["archive", "display"]);
  });

  it("keeps the archive at a higher quality than the display copy", () => {
    // Every future size is re-derived from the archive, so its artefacts
    // compound in a way the display copy's never do.
    const [archive, display] = planVariants({ width: 8000, height: 8000 });
    expect(archive.quality).toBeGreaterThan(display.quality);
    expect(archive.maxEdge).toBeGreaterThan(display.maxEdge);
  });
});

describe("encodeImageVariants", () => {
  it("decodes ONCE and encodes each planned variant", async () => {
    // Decoding a 48MP frame is seconds on a phone; calling a single-variant
    // helper twice would pay that twice.
    const ops = imageOps({ width: 8064, height: 6048 });
    const decode = vi.spyOn(ops, "decode");
    const r = await encodeImageVariants(blobOf(12_000_000), ops);

    expect(r.ok).toBe(true);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(ops.encode).toHaveBeenCalledTimes(2);
  });

  it("scales each variant into its own fitted box", async () => {
    const ops = imageOps({ width: 8064, height: 6048 });
    await encodeImageVariants(blobOf(12_000_000), ops);

    expect(ops.encode).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      { width: ARCHIVE_MAX_EDGE, height: 3072 },
      0.92,
    );
    expect(ops.encode).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      { width: DISPLAY_MAX_EDGE, height: 1200 },
      0.82,
    );
  });

  it("reports the SOURCE dimensions alongside each variant's own box", async () => {
    const ops = imageOps({ width: 8064, height: 6048 });
    const r = await encodeImageVariants(blobOf(12_000_000), ops);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.source).toEqual({ width: 8064, height: 6048 });
    expect(r.value.variants.map((v) => v.box.width)).toEqual([4096, 1600]);
  });

  it("honours a caller's plan", async () => {
    const ops = imageOps({ width: 4000, height: 4000 });
    await encodeImageVariants(blobOf(1000), ops, () => [
      { name: "display", maxEdge: 200, quality: 0.5 },
    ]);
    expect(ops.encode).toHaveBeenCalledTimes(1);
    expect(ops.encode).toHaveBeenCalledWith(
      expect.anything(),
      { width: 200, height: 200 },
      0.5,
    );
  });

  it("returns DecodeFailed rather than throwing", async () => {
    const ops: ImageOps = {
      decode: async () => {
        throw new Error("not an image");
      },
      encode: async () => blobOf(1),
    };
    const r = await encodeImageVariants(blobOf(10), ops);
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
    const r = await encodeImageVariants(blobOf(10), ops);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("EncodeFailed");
  });

  it("releases the decoded image even when an encode throws", async () => {
    // Without this, a tab uploading twenty images leaks twenty decoded
    // bitmaps — which on a phone is the tab being killed.
    const release = vi.fn();
    const ops: ImageOps = {
      decode: async () => ({ width: 10, height: 10, handle: null }),
      encode: async () => {
        throw new Error("no canvas");
      },
      release,
    };
    await encodeImageVariants(blobOf(10), ops);
    expect(release).toHaveBeenCalledTimes(1);
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

/**
 * `uploadPreparedWith` — the asymmetry between the origin and the files
 * derived from it. Driven through a fake driver, which is why the driver is a
 * parameter rather than something the function reaches for.
 */

import { describe, expect, it, vi } from "vitest";

import type { PreparedMedia } from "@/lib/media/types";
import type { StorageDriver, UploadInput } from "@/lib/storage/types";
import { uploadPreparedWith } from "@/lib/storage/upload";

const IDS = { productId: "prod-1", attachmentId: "att-1" };

const blob = (bytes: number) => new Blob([new Uint8Array(bytes)]);

const imageMedia = (): PreparedMedia => ({
  kind: "image",
  origin: {
    blob: blob(900_000),
    mime: "image/jpeg",
    bytes: 900_000,
    filename: "Tote Bag.jpeg",
  },
  optimized: { blob: blob(50_000), mime: "image/webp", bytes: 50_000 },
  poster: null,
  width: 3000,
  height: 2000,
  durationMs: null,
});

const videoMedia = (): PreparedMedia => ({
  kind: "video",
  origin: {
    blob: blob(40_000_000),
    mime: "video/mp4",
    bytes: 40_000_000,
    filename: "demo.mp4",
  },
  optimized: null,
  poster: { blob: blob(9_000), mime: "image/webp", bytes: 9_000 },
  width: 1920,
  height: 1080,
  durationMs: 8_000,
});

/** Records every call and reports progress the way a real upload would. */
const fakeDriver = (
  fail?: (key: string) => boolean,
): StorageDriver & { readonly calls: UploadInput[] } => {
  const calls: UploadInput[] = [];
  return {
    name: "local",
    calls,
    upload: async (input) => {
      calls.push(input);
      if (fail?.(input.key)) throw new Error(`upload failed: ${input.key}`);
      input.onProgress?.(0.5);
      input.onProgress?.(1);
      return `/uploads/${input.key}`;
    },
  };
};

describe("uploadPreparedWith — images", () => {
  it("uploads the origin and the optimized variant to distinct keys", async () => {
    const driver = fakeDriver();
    const result = await uploadPreparedWith(driver, imageMedia(), IDS);

    expect(driver.calls.map((c) => c.key)).toEqual([
      "products/prod-1/att-1/origin-tote-bag.jpg",
      "products/prod-1/att-1/optimized-tote-bag.webp",
    ]);
    expect(result.originUrl).toContain("origin-tote-bag.jpg");
    expect(result.optimizedUrl).toContain("optimized-tote-bag.webp");
    expect(result.posterUrl).toBeNull();
  });

  it("uploads the origin FIRST", async () => {
    // Not cosmetic ordering: if the origin is going to fail, nothing else is
    // worth spending the operator's bandwidth on.
    const driver = fakeDriver();
    await uploadPreparedWith(driver, imageMedia(), IDS);
    expect(driver.calls[0].key).toContain("origin-");
  });

  it("sends each artefact with its own content type", async () => {
    // The origin keeps its JPEG type while the variant is WebP; sending both
    // as one type is how a stored file ends up unopenable.
    const driver = fakeDriver();
    await uploadPreparedWith(driver, imageMedia(), IDS);
    expect(driver.calls.map((c) => c.mime)).toEqual([
      "image/jpeg",
      "image/webp",
    ]);
  });
});

describe("uploadPreparedWith — failure asymmetry", () => {
  it("fails the attachment when the ORIGIN fails", async () => {
    const driver = fakeDriver((key) => key.includes("origin-"));
    await expect(uploadPreparedWith(driver, imageMedia(), IDS)).rejects.toThrow(
      /upload failed/,
    );
    // And it does not go on to upload the variant of a file that is not there.
    expect(driver.calls).toHaveLength(1);
  });

  it("keeps the attachment when only the DERIVED file fails", async () => {
    // The origin is already stored. Re-running a 40 MB upload to recover a
    // 9 KB thumbnail is a worse outcome than having no thumbnail.
    const driver = fakeDriver((key) => key.includes("optimized-"));
    const result = await uploadPreparedWith(driver, imageMedia(), IDS);

    expect(result.originUrl).toContain("origin-tote-bag.jpg");
    expect(result.optimizedUrl).toBeNull();
  });

  it("keeps a video whose poster failed", async () => {
    const driver = fakeDriver((key) => key.includes("poster-"));
    const result = await uploadPreparedWith(driver, videoMedia(), IDS);

    expect(result.originUrl).toContain("origin-demo.mp4");
    expect(result.posterUrl).toBeNull();
    expect(result.optimizedUrl).toBeNull();
  });
});

describe("uploadPreparedWith — video", () => {
  it("uploads the origin and the poster, never an optimized variant", async () => {
    // v1 does not transcode video; the bytes go up as chosen.
    const driver = fakeDriver();
    const result = await uploadPreparedWith(driver, videoMedia(), IDS);

    expect(driver.calls.map((c) => c.key)).toEqual([
      "products/prod-1/att-1/origin-demo.mp4",
      "products/prod-1/att-1/poster-demo.webp",
    ]);
    expect(result.optimizedUrl).toBeNull();
    expect(result.posterUrl).toContain("poster-demo.webp");
  });

  it("uploads only the origin when there is no poster", async () => {
    const driver = fakeDriver();
    const media = { ...videoMedia(), poster: null };
    const result = await uploadPreparedWith(driver, media, IDS);

    expect(driver.calls).toHaveLength(1);
    expect(result.posterUrl).toBeNull();
  });
});

describe("uploadPreparedWith — progress", () => {
  it("weights progress by bytes, not per file", async () => {
    // A 40 MB origin and a 9 KB poster: averaging the two fractions would put
    // the bar at 50% while the video had barely started.
    const driver: StorageDriver = {
      name: "local",
      upload: async (input) => {
        input.onProgress?.(1);
        return `/uploads/${input.key}`;
      },
    };
    const seen: number[] = [];
    await uploadPreparedWith(driver, videoMedia(), IDS, (f) => seen.push(f));

    // After the origin alone, the bar is essentially full — the poster is
    // 0.02% of the bytes.
    const afterOrigin = seen[0];
    expect(afterOrigin).toBeGreaterThan(0.99);
    expect(seen.at(-1)).toBe(1);
  });

  it("always ends at exactly 1, including when the derived upload failed", async () => {
    const driver = fakeDriver((key) => key.includes("optimized-"));
    const onProgress = vi.fn();
    await uploadPreparedWith(driver, imageMedia(), IDS, onProgress);
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it("reports 1 rather than dividing by zero for an empty file", async () => {
    const driver = fakeDriver();
    const media: PreparedMedia = {
      ...imageMedia(),
      origin: { ...imageMedia().origin, bytes: 0 },
      optimized: null,
    };
    const onProgress = vi.fn();
    await uploadPreparedWith(driver, media, IDS, onProgress);
    expect(onProgress).toHaveBeenCalledWith(1);
    expect(onProgress.mock.calls.every(([f]) => Number.isFinite(f))).toBe(true);
  });

  it("passes the abort signal to every upload", async () => {
    const driver = fakeDriver();
    const controller = new AbortController();
    await uploadPreparedWith(
      driver,
      imageMedia(),
      IDS,
      undefined,
      controller.signal,
    );
    expect(driver.calls.every((c) => c.signal === controller.signal)).toBe(
      true,
    );
  });
});

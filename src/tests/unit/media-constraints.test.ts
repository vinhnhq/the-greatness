import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  kindOf,
  maxBytesFor,
  validateFile,
} from "@/lib/media/constraints";

describe("kindOf", () => {
  it.each([
    ["image/jpeg", "image"],
    ["image/png", "image"],
    ["image/webp", "image"],
    ["image/gif", "image"],
    ["video/mp4", "video"],
    ["video/quicktime", "video"],
  ] as const)("%s → %s", (mime, expected) => {
    expect(kindOf(mime)).toBe(expected);
  });

  it("tolerates the codec parameter a browser attaches", () => {
    // Chrome hands `video/webm;codecs=vp9` straight through on a drag-drop.
    expect(kindOf("video/webm;codecs=vp9")).toBe("video");
    expect(kindOf("IMAGE/JPEG")).toBe("image");
  });

  it.each([
    "application/pdf",
    "text/html",
    "image/svg+xml", // deliberately absent: SVG carries script
    "",
    "image",
  ])("rejects %s", (mime) => {
    expect(kindOf(mime)).toBeNull();
  });
});

describe("validateFile", () => {
  it("accepts an ordinary image", () => {
    const r = validateFile({ type: "image/png", size: 500_000 });
    expect(r).toEqual({
      ok: true,
      value: { kind: "image", mime: "image/png" },
    });
  });

  it("rejects an unsupported type by code, not by message", () => {
    const r = validateFile({ type: "application/zip", size: 10 });
    expect(r.ok).toBe(false);
    if (!r.ok)
      expect(r.error).toEqual({
        tag: "UnsupportedType",
        mime: "application/zip",
      });
  });

  it("rejects a zero-byte file", () => {
    const r = validateFile({ type: "image/png", size: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("Empty");
  });

  it("applies the per-kind cap, not one shared cap", () => {
    // A 60 MB video is fine; a 60 MB image is not. One shared limit would let
    // the image through, which is the bug this asserts against.
    const video = validateFile({ type: "video/mp4", size: 60 * 1024 * 1024 });
    const image = validateFile({ type: "image/png", size: 60 * 1024 * 1024 });
    expect(video.ok).toBe(true);
    expect(image.ok).toBe(false);
    if (!image.ok && image.error.tag === "TooLarge") {
      expect(image.error.limit).toBe(MAX_IMAGE_BYTES);
    }
  });

  it("accepts a photograph a modern phone actually produces", () => {
    // The whole reason the ceiling moved. An iPhone 48MP JPEG is 10–15 MB and
    // a 200MP Android frame can pass 20 — the first version of this rejected
    // every one of them before the optimizer ever saw the file.
    for (const mb of [8.5, 12, 15, 24]) {
      const r = validateFile({ type: "image/jpeg", size: mb * 1024 * 1024 });
      expect(r.ok, `${mb} MB`).toBe(true);
    }
  });

  it("accepts a file exactly at the limit and rejects one byte past it", () => {
    expect(validateFile({ type: "image/png", size: MAX_IMAGE_BYTES }).ok).toBe(
      true,
    );
    expect(
      validateFile({ type: "image/png", size: MAX_IMAGE_BYTES + 1 }).ok,
    ).toBe(false);
    expect(validateFile({ type: "video/mp4", size: MAX_VIDEO_BYTES }).ok).toBe(
      true,
    );
    expect(
      validateFile({ type: "video/mp4", size: MAX_VIDEO_BYTES + 1 }).ok,
    ).toBe(false);
  });

  it("checks the type before the size", () => {
    // A 500 MB PDF should say "not a media file", not "too large" — the
    // second sends the user off to compress something we would never take.
    const r = validateFile({
      type: "application/pdf",
      size: 500 * 1024 * 1024,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.tag).toBe("UnsupportedType");
  });
});

describe("maxBytesFor", () => {
  it("keeps video's cap above image's", () => {
    expect(maxBytesFor("video")).toBeGreaterThan(maxBytesFor("image"));
  });
});

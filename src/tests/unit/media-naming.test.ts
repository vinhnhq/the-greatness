import { describe, expect, it } from "vitest";

import { attachmentKeys, extensionFor, safeStem } from "@/lib/media/naming";

describe("safeStem", () => {
  it("lowercases and dashes a plain filename", () => {
    expect(safeStem("Summer Tote Bag.JPG")).toBe("summer-tote-bag");
  });

  it("strips Vietnamese diacritics rather than dashing them out", () => {
    expect(safeStem("Áo dài lụa.png")).toBe("ao-dai-lua");
  });

  it("cannot produce a path segment", () => {
    // The local storage driver joins this onto a directory. A stem that keeps
    // `..` writes outside the uploads root.
    expect(safeStem("../../etc/passwd")).toBe("passwd");
    expect(safeStem("/absolute/path/photo.png")).toBe("photo");
    expect(safeStem("..\\..\\windows\\system32")).toBe("system32");
    expect(safeStem("....//....//x.png")).toBe("x");
  });

  it("never returns an empty string", () => {
    expect(safeStem(".png")).toBe("file");
    expect(safeStem("")).toBe("file");
    expect(safeStem("...")).toBe("file");
    expect(safeStem("🎉🎉🎉.png")).toBe("file");
  });

  it("caps the length without leaving a trailing dash", () => {
    const stem = safeStem(`${"a".repeat(200)}.png`);
    expect(stem).toHaveLength(48);
    expect(stem.endsWith("-")).toBe(false);
  });

  it("keeps a filename with no extension", () => {
    expect(safeStem("README")).toBe("readme");
  });
});

describe("extensionFor", () => {
  it.each([
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["video/quicktime", "mov"],
    ["video/webm;codecs=vp9", "webm"],
    ["application/octet-stream", "bin"],
  ])("%s → .%s", (mime, ext) => {
    expect(extensionFor(mime)).toBe(ext);
  });
});

describe("attachmentKeys", () => {
  const keys = attachmentKeys({
    productId: "0197f0a3-1c2d-7e4f-8a1b-2c3d4e5f6071",
    attachmentId: "0197f0a3-1c2d-7e4f-8a1b-2c3d4e5f6072",
    filename: "Summer Tote.jpeg",
    mime: "image/jpeg",
  });

  it("keeps the origin's own format and forces webp for the derived files", () => {
    expect(keys.origin).toMatch(/\/origin-summer-tote\.jpg$/);
    expect(keys.optimized).toMatch(/\/optimized-summer-tote\.webp$/);
    expect(keys.poster).toMatch(/\/poster-summer-tote\.webp$/);
  });

  it("scopes all three under the product and the attachment", () => {
    for (const key of Object.values(keys)) {
      expect(
        key.startsWith("products/0197f0a3-1c2d-7e4f-8a1b-2c3d4e5f6071/"),
      ).toBe(true);
      expect(key).not.toContain("..");
    }
  });

  it("gives two files with the same name distinct keys", () => {
    const other = attachmentKeys({
      productId: "p",
      attachmentId: "a2",
      filename: "Summer Tote.jpeg",
      mime: "image/jpeg",
    });
    const same = attachmentKeys({
      productId: "p",
      attachmentId: "a1",
      filename: "Summer Tote.jpeg",
      mime: "image/jpeg",
    });
    expect(other.origin).not.toBe(same.origin);
  });
});

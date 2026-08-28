/**
 * The local driver joins these onto a filesystem path, so this is the check
 * standing between an operator-supplied filename and an arbitrary file write.
 */

import { describe, expect, it } from "vitest";

import { mediaKeys } from "@/lib/media/naming";
import { assertSafeKey, isSafeKey, MAX_KEY_LENGTH } from "@/lib/storage/keys";

describe("isSafeKey", () => {
  it("accepts the keys the naming module actually produces", () => {
    const keys = mediaKeys({
      mediaId: "0197f0a3-1c2d-7e4f-8a1b-2c3d4e5f6072",
      filename: "Áo dài lụa.jpeg",
      mime: "image/jpeg",
    });
    for (const key of Object.values(keys)) expect(isSafeKey(key)).toBe(true);
  });

  it.each([
    ["traversal", "media/../../etc/passwd"],
    ["traversal mid-path", "media/a/../../../x.png"],
    ["absolute", "/etc/passwd"],
    ["leading dot", ".ssh/id_rsa"],
    ["doubled slash", "media//x.png"],
    ["trailing slash", "media/x/"],
    ["backslash", "media\\..\\x.png"],
    ["NUL byte", "media/x\0.png"],
    ["newline", "media/x\n.png"],
    ["space", "media/my file.png"],
    ["url-encoded traversal", "media/%2e%2e/x.png"],
    ["empty", ""],
  ])("rejects %s", (_label, key) => {
    expect(isSafeKey(key)).toBe(false);
  });

  it("rejects an absurdly long key", () => {
    expect(isSafeKey(`a/${"b".repeat(MAX_KEY_LENGTH)}`)).toBe(false);
  });
});

describe("assertSafeKey", () => {
  it("returns the key when it is safe", () => {
    expect(assertSafeKey("media/a/origin-x.jpg")).toBe("media/a/origin-x.jpg");
  });

  it("throws without echoing an unbounded string back", () => {
    expect(() => assertSafeKey(`../${"x".repeat(500)}`)).toThrow(
      /Unsafe storage key/,
    );
  });
});

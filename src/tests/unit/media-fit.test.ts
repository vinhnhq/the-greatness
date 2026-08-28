import { describe, expect, it } from "vitest";

import { fitWithin } from "@/lib/media/fit";

describe("fitWithin", () => {
  it("scales a landscape image by its longest edge", () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 1600)).toEqual({
      width: 1600,
      height: 1200,
    });
  });

  it("scales a portrait image by its longest edge", () => {
    expect(fitWithin({ width: 3000, height: 4000 }, 1600)).toEqual({
      width: 1200,
      height: 1600,
    });
  });

  it("handles a square", () => {
    expect(fitWithin({ width: 2048, height: 2048 }, 1600)).toEqual({
      width: 1600,
      height: 1600,
    });
  });

  it("never upscales", () => {
    // A 40x40 icon must stay 40x40. Enlarging costs bytes and adds no detail,
    // and the "optimized" file would end up bigger than the original.
    expect(fitWithin({ width: 40, height: 40 }, 1600)).toEqual({
      width: 40,
      height: 40,
    });
  });

  it("returns the source unchanged when it exactly meets the bound", () => {
    expect(fitWithin({ width: 1600, height: 900 }, 1600)).toEqual({
      width: 1600,
      height: 900,
    });
  });

  it("keeps an extreme aspect ratio at least 1px on the short side", () => {
    // A 10000x3 banner scales its height to 0.48 — a canvas of height 0 throws.
    expect(fitWithin({ width: 10_000, height: 3 }, 1600)).toEqual({
      width: 1600,
      height: 1,
    });
  });

  it("rounds to whole pixels", () => {
    const box = fitWithin({ width: 1000, height: 333 }, 800);
    expect(Number.isInteger(box.width)).toBe(true);
    expect(Number.isInteger(box.height)).toBe(true);
    expect(box).toEqual({ width: 800, height: 266 });
  });

  it.each([
    [{ width: 0, height: 0 }],
    [{ width: -5, height: 10 }],
    [{ width: Number.NaN, height: 10 }],
    [{ width: Number.POSITIVE_INFINITY, height: 10 }],
  ])(
    "degrades a nonsense source (%o) to 1x1 rather than throwing",
    (source) => {
      expect(fitWithin(source, 1600)).toEqual({ width: 1, height: 1 });
    },
  );

  it("leaves the source alone when the bound is nonsense", () => {
    expect(fitWithin({ width: 30, height: 20 }, 0)).toEqual({
      width: 30,
      height: 20,
    });
  });
});

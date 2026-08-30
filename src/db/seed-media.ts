/**
 * A generated PNG, for the one place that still needs one.
 *
 * This used to supply the seed with placeholder squares. It no longer does —
 * `seed-sapo.ts` loads the real catalogue's photographs — and everything that
 * wrote them to storage went with it. What is left is `placeholderPng`, which
 * `setup-e2e.ts` uses to build a 5000×3000 file: the E2E suite needs an image
 * over `ARCHIVE_MAX_EDGE` to prove the browser's resize path, and generating
 * one beats committing a multi-megabyte fixture.
 *
 * PNGs are encoded here rather than committed as binary fixtures: a few
 * hundred lines of zlib beats a megabyte of blobs in git history, and the
 * colours are derived from a seed string so the same input is the same image.
 */

import zlib from "node:zlib";

/** A stable hue per name, so the same product is the same colour every seed. */
const hueOf = (seed: string): number => {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.codePointAt(0)!) % 360;
  return hash;
};

/** Minimal HSL→RGB, enough for flat, pleasant placeholder colours. */
const hslToRgb = (
  h: number,
  s: number,
  l: number,
): readonly [number, number, number] => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
};

const chunk = (type: string, data: Buffer): Buffer => {
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(typed) >>> 0);
  return Buffer.concat([length, typed, crc]);
};

/**
 * A `width`×`height` PNG: a diagonal gradient between two shades of the seed's
 * hue, with a lighter band so a thumbnail is visibly *something* rather than a
 * flat square. Square by default; the E2E suite asks for a wide one to prove
 * the browser's resize path with a real, oversized image.
 */
export const placeholderPng = (
  seed: string,
  width: number,
  height: number = width,
): Buffer => {
  const hue = hueOf(seed);
  const [r1, g1, b1] = hslToRgb(hue, 0.45, 0.32);
  const [r2, g2, b2] = hslToRgb((hue + 40) % 360, 0.5, 0.62);

  // Raw scanlines: each row is a filter byte (0 = none) then RGB triples.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      const t = (x / width + y / height) / 2;
      // A soft diagonal band, so the gradient has a feature in it.
      const band = Math.abs(x / width - y / height) < 0.08 ? 26 : 0;
      raw[offset++] = Math.min(255, Math.round(r1 + (r2 - r1) * t) + band);
      raw[offset++] = Math.min(255, Math.round(g1 + (g2 - g1) * t) + band);
      raw[offset++] = Math.min(255, Math.round(b1 + (b2 - b1) * t) + band);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  // 10..12 are compression, filter and interlace methods — all 0.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

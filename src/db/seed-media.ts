/**
 * Generated placeholder images for the seed.
 *
 * The gallery is the one page that is meaningless with an empty database, and
 * "run the app, then upload twenty files by hand to see if it works" is not a
 * demo — it is a chore that gets skipped, which is how a page ships broken.
 *
 * PNGs are encoded here rather than committed as binary fixtures: a few
 * hundred lines of zlib beats a megabyte of blobs in git history, the colours
 * can be derived from the product name so every tile is distinguishable, and
 * nothing has to be regenerated when the seed list changes.
 *
 * Two sizes per product, written through the **real** storage keys, so the
 * seeded rows exercise the same origin/optimized pair a genuine upload
 * produces — including the size difference the attachment card reports.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
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
 * A `size`×`size` PNG: a diagonal gradient between two shades of the seed's
 * hue, with a lighter band so a thumbnail is visibly *something* rather than
 * a flat square.
 */
export const placeholderPng = (seed: string, size: number): Buffer => {
  const hue = hueOf(seed);
  const [r1, g1, b1] = hslToRgb(hue, 0.45, 0.32);
  const [r2, g2, b2] = hslToRgb((hue + 40) % 360, 0.5, 0.62);

  // Raw scanlines: each row is a filter byte (0 = none) then RGB triples.
  const raw = Buffer.alloc(size * (1 + size * 3));
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < size; x++) {
      const t = (x / size + y / size) / 2;
      // A soft diagonal band, so the gradient has a feature in it.
      const band = Math.abs(x / size - y / size) < 0.08 ? 26 : 0;
      raw[offset++] = Math.min(255, Math.round(r1 + (r2 - r1) * t) + band);
      raw[offset++] = Math.min(255, Math.round(g1 + (g2 - g1) * t) + band);
      raw[offset++] = Math.min(255, Math.round(b1 + (b2 - b1) * t) + band);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
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

export type SeededAttachment = {
  readonly originUrl: string;
  readonly optimizedUrl: string;
  readonly bytes: number;
  readonly optimizedBytes: number;
  readonly width: number;
  readonly height: number;
};

const ORIGIN_SIZE = 900;
const OPTIMIZED_SIZE = 450;

/**
 * Write one product's placeholder pair under the local storage root and
 * return the row fields.
 *
 * Only meaningful for `STORAGE_DRIVER=local` — a Blob deployment has nowhere
 * on disk to put these, and seeding a production bucket with generated
 * squares is not something to do by accident. The caller checks.
 */
export const writePlaceholder = async (
  root: string,
  ids: { readonly productId: string; readonly attachmentId: string },
  seed: string,
): Promise<SeededAttachment> => {
  const dir = path.join(root, "products", ids.productId, ids.attachmentId);
  await fs.mkdir(dir, { recursive: true });

  const origin = placeholderPng(seed, ORIGIN_SIZE);
  const optimized = placeholderPng(seed, OPTIMIZED_SIZE);
  const originName = `origin-${ids.attachmentId.slice(0, 8)}.png`;
  const optimizedName = `optimized-${ids.attachmentId.slice(0, 8)}.png`;

  await fs.writeFile(path.join(dir, originName), origin);
  await fs.writeFile(path.join(dir, optimizedName), optimized);

  const base = `/uploads/products/${ids.productId}/${ids.attachmentId}`;
  return {
    originUrl: `${base}/${originName}`,
    optimizedUrl: `${base}/${optimizedName}`,
    bytes: origin.length,
    optimizedBytes: optimized.length,
    width: ORIGIN_SIZE,
    height: ORIGIN_SIZE,
  };
};

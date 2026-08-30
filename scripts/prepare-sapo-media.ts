/**
 * Turn the downloaded Sapo images into the pair `media_assets` wants, and
 * name them after the product rather than after the CDN.
 *
 * Three things happen to each file.
 *
 * **The watermark comes off.** 255 of the 786 images carry a "Công ty TNHH
 * Tam Anh Tài" logo in the top-right corner. It is found by its three
 * signature colours — magenta, teal and blue, which nothing else in a
 * catalogue of white appliances gets close to — and erased to white.
 *
 * The erase is only allowed when the ring just outside the padded box is
 * already white, and that check is what makes the whole thing safe rather
 * than clever: four marketing banners (Shopee, WonderWear) use the same
 * colours and would otherwise have had a white hole punched in them. They
 * fail the ring test and are left alone. A detector that is merely accurate
 * would damage them; one that refuses to paint over anything but white
 * cannot.
 *
 * **Two variants are written**, matching `lib/media/optimize-image.ts` so a
 * seeded row is indistinguishable from an uploaded one:
 *   - the origin, at most `ARCHIVE_MAX_EDGE`, re-encoded **only** if the
 *     watermark was erased or the image is over the cap — otherwise the true
 *     bytes are copied through, exactly as `prepare.ts` does;
 *   - the display copy, `DISPLAY_MAX_EDGE` WebP at `DISPLAY_QUALITY`.
 *
 * **They are named `<slug>-<n>-original.<ext>` and `<slug>-<n>.webp`**, and
 * that name becomes the storage key, so the URL in the database reads as the
 * product. Every image is numbered even when a product has only one: adding a
 * second later then renames nothing.
 *
 * Usage: bun run prepare:sapo-media
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { ARCHIVE_MAX_EDGE, ARCHIVE_QUALITY } from "@/lib/media/constraints";
import { fitWithin } from "@/lib/media/fit";
import { DISPLAY_MAX_EDGE, DISPLAY_QUALITY } from "@/lib/media/optimize-image";

const ROOT = join(import.meta.dirname, "..", "data", "sapo");
const IMAGES = join(ROOT, "images");
const MEDIA = join(ROOT, "media");

/** The watermark's three brand colours, sampled from a clean example. */
const LOGO_COLORS = [
  [245, 13, 135],
  [31, 182, 165],
  [2, 125, 185],
] as const;
const COLOR_TOLERANCE = 30;
/** Below this many matching pixels the corner holds no logo, only noise. */
const MIN_LOGO_PIXELS = 150;
/** A row needs this many dark pixels to count as caption rather than speck. */
const MIN_CAPTION_PIXELS = 3;
const CAPTION_DARK = 200;
/** Anything at or above this is "white" for the purposes of the ring test. */
const WHITE = 245;
const ERASE_PAD = 6;

type Pixels = {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
};
type Box = {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
};

const at = (p: Pixels, x: number, y: number): number => (y * p.width + x) * 3;

const isWhite = (p: Pixels, x: number, y: number): boolean => {
  const i = at(p, x, y);
  return (
    p.data[i]! >= WHITE && p.data[i + 1]! >= WHITE && p.data[i + 2]! >= WHITE
  );
};

const isDark = (p: Pixels, x: number, y: number): boolean => {
  const i = at(p, x, y);
  return Math.min(p.data[i]!, p.data[i + 1]!, p.data[i + 2]!) < CAPTION_DARK;
};

const isLogoColor = (p: Pixels, x: number, y: number): boolean => {
  const i = at(p, x, y);
  const r = p.data[i]!;
  const g = p.data[i + 1]!;
  const b = p.data[i + 2]!;
  return LOGO_COLORS.some(
    ([lr, lg, lb]) =>
      Math.abs(r - lr) < COLOR_TOLERANCE &&
      Math.abs(g - lg) < COLOR_TOLERANCE &&
      Math.abs(b - lb) < COLOR_TOLERANCE,
  );
};

/**
 * The watermark's bounds, or null.
 *
 * The search is confined to the top-right corner (the right 26% and top 20%)
 * because that is where the mark always sits, and because a genuinely pink
 * product elsewhere in the frame otherwise drags the box across the image.
 */
const findLogo = (p: Pixels): Box | null => {
  const rx0 = Math.floor(p.width * 0.74);
  const ry1 = Math.floor(p.height * 0.2);

  let mx0 = p.width;
  let mx1 = -1;
  let my0 = p.height;
  let my1 = -1;
  let found = 0;
  for (let y = 0; y < ry1; y++) {
    for (let x = rx0; x < p.width; x++) {
      if (!isLogoColor(p, x, y)) continue;
      found++;
      if (x < mx0) mx0 = x;
      if (x > mx1) mx1 = x;
      if (y < my0) my0 = y;
      if (y > my1) my1 = y;
    }
  }
  if (found < MIN_LOGO_PIXELS) return null;

  // The caption is one line of black type under the mark. Walk down while
  // rows still hold several dark pixels; bound the walk by the mark's own
  // height rather than the canvas, or a product below gets swallowed.
  const markHeight = my1 - my0;
  const bandX0 = Math.max(0, mx0 - Math.floor(p.width * 0.05));
  const bandX1 = Math.min(p.width, mx1 + Math.floor(p.width * 0.05));
  const limit = Math.min(p.height, my1 + Math.floor(markHeight * 0.45));
  const maxGap = Math.max(4, Math.floor(markHeight * 0.12));

  let ty1 = my1;
  let gap = 0;
  for (let y = my1 + 1; y < limit; y++) {
    let dark = 0;
    for (let x = bandX0; x < bandX1 && dark < MIN_CAPTION_PIXELS; x++) {
      if (isDark(p, x, y)) dark++;
    }
    if (dark >= MIN_CAPTION_PIXELS) {
      ty1 = y;
      gap = 0;
    } else if (++gap > maxGap) {
      break;
    }
  }

  // The caption can be wider than the mark it sits under.
  let cx0 = mx0;
  let cx1 = mx1;
  for (let y = my1 + 1; y <= ty1; y++) {
    for (let x = bandX0; x < bandX1; x++) {
      if (!isDark(p, x, y)) continue;
      if (x < cx0) cx0 = x;
      if (x > cx1) cx1 = x;
    }
  }
  return { x0: Math.min(mx0, cx0), x1: Math.max(mx1, cx1), y0: my0, y1: ty1 };
};

/**
 * White out `box`, but only if the ring just outside it already is white.
 *
 * The guard is the point: a false positive is a banner that happens to use
 * the same three colours, and painting a white rectangle over one is far
 * worse than leaving a logo on.
 */
const eraseLogo = (p: Pixels, box: Box): boolean => {
  const X0 = Math.max(0, box.x0 - ERASE_PAD);
  const X1 = Math.min(p.width, box.x1 + 1 + ERASE_PAD);
  const Y0 = Math.max(0, box.y0 - ERASE_PAD);
  const Y1 = Math.min(p.height, box.y1 + 1 + ERASE_PAD);

  for (let x = X0; x < X1; x++) {
    if (Y0 > 0 && !isWhite(p, x, Y0 - 1)) return false;
    if (Y1 < p.height && !isWhite(p, x, Y1)) return false;
  }
  for (let y = Y0; y < Y1; y++) {
    if (X0 > 0 && !isWhite(p, X0 - 1, y)) return false;
    if (X1 < p.width && !isWhite(p, X1, y)) return false;
  }

  for (let y = Y0; y < Y1; y++) {
    p.data.fill(255, at(p, X0, y), at(p, X1 - 1, y) + 3);
  }
  return true;
};

type Product = {
  readonly slug: string;
  readonly images: readonly {
    readonly file: string;
    readonly position: number;
  }[];
};

type MediaEntry = {
  readonly slug: string;
  readonly position: number;
  readonly sourceFile: string;
  readonly logoRemoved: boolean;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly originFile: string;
  readonly originBytes: number;
  readonly optimizedFile: string;
  readonly optimizedBytes: number;
};

const EXT_BY_MIME: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

const main = async (): Promise<void> => {
  const products = JSON.parse(
    await readFile(join(ROOT, "products.json"), "utf8"),
  ) as Product[];

  // A rebuild rather than a merge: a slug that changed upstream would
  // otherwise leave its old files behind for the seed to find.
  await rm(MEDIA, { recursive: true, force: true });
  await mkdir(MEDIA, { recursive: true });

  const entries: MediaEntry[] = [];
  let erased = 0;
  let refused = 0;
  let done = 0;

  for (const product of products) {
    for (const image of product.images) {
      const source = await readFile(join(IMAGES, image.file));
      const meta = await sharp(source).metadata();
      const mime = `image/${meta.format}`;
      const ext = EXT_BY_MIME[mime] ?? "jpg";

      // `flatten` alone, deliberately: `ensureAlpha` before it leaves four
      // channels in the raw buffer while every read below assumes three, and
      // the misalignment is silent — it reports plausible-looking colour hits
      // and then refuses every erase.
      const raw = await sharp(source)
        .flatten({ background: "#ffffff" })
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (raw.info.channels !== 3) {
        throw new Error(
          `${image.file}: expected 3 raw channels, got ${raw.info.channels}`,
        );
      }
      const pixels: Pixels = {
        data: raw.data,
        width: raw.info.width,
        height: raw.info.height,
      };

      const box = findLogo(pixels);
      const logoRemoved = box !== null && eraseLogo(pixels, box);
      if (box !== null) {
        if (logoRemoved) erased++;
        else refused++;
      }

      const fit = fitWithin(
        { width: pixels.width, height: pixels.height },
        ARCHIVE_MAX_EDGE,
      );
      const oversized =
        fit.width !== pixels.width || fit.height !== pixels.height;

      // Untouched and within the cap: pass the true bytes through, which is
      // what `lib/media/prepare.ts` does for an upload that needs no work.
      let origin: Buffer;
      if (!logoRemoved && !oversized) {
        origin = source;
      } else {
        const edited = sharp(pixels.data, {
          raw: { width: pixels.width, height: pixels.height, channels: 3 },
        }).resize(fit.width, fit.height, { fit: "inside" });
        origin =
          mime === "image/png"
            ? await edited.png({ compressionLevel: 9 }).toBuffer()
            : await edited
                .jpeg({ quality: Math.round(ARCHIVE_QUALITY * 100) })
                .toBuffer();
      }

      const display = fitWithin(
        { width: fit.width, height: fit.height },
        DISPLAY_MAX_EDGE,
      );
      const optimized = await sharp(pixels.data, {
        raw: { width: pixels.width, height: pixels.height, channels: 3 },
      })
        .resize(display.width, display.height, { fit: "inside" })
        .webp({ quality: Math.round(DISPLAY_QUALITY * 100) })
        .toBuffer();

      const originFile = `${product.slug}-${image.position}-original.${ext}`;
      const optimizedFile = `${product.slug}-${image.position}.webp`;
      await writeFile(join(MEDIA, originFile), origin);
      await writeFile(join(MEDIA, optimizedFile), optimized);

      entries.push({
        slug: product.slug,
        position: image.position,
        sourceFile: image.file,
        logoRemoved,
        mime,
        width: fit.width,
        height: fit.height,
        originFile,
        originBytes: origin.byteLength,
        optimizedFile,
        optimizedBytes: optimized.byteLength,
      });
      if (++done % 100 === 0) console.log(`  ${done} prepared`);
    }
  }

  await writeFile(
    join(ROOT, "media.json"),
    `${JSON.stringify(entries, null, 1)}\n`,
  );

  const files = await readdir(MEDIA);
  const originTotal = entries.reduce((n, e) => n + e.originBytes, 0);
  const optimizedTotal = entries.reduce((n, e) => n + e.optimizedBytes, 0);
  console.log(
    `\n${entries.length} images → ${files.length} files in data/sapo/media/\n` +
      `  watermark erased on ${erased}; ${refused} refused (not on white)\n` +
      `  origins  ${(originTotal / 1024 / 1024).toFixed(1)} MB\n` +
      `  optimized ${(optimizedTotal / 1024 / 1024).toFixed(1)} MB`,
  );
};

await main();

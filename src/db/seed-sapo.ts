/**
 * The real catalogue, read out of `data/sapo/` and written into the database.
 *
 * This is what `bun run seed` loads. It replaced thirty invented products
 * because they were too tidy to be useful: every one had a price, a
 * description, a category and an image, so the list looked right in a way the
 * real thing never does. The Sapo catalogue is 832 products of which **697
 * belong to no category, 160 cost nothing and 298 have no description** — a
 * shape that finds the empty states by simply existing.
 *
 * ## What is decided here, and why
 *
 * **Description is the source HTML reduced to text.** The form's field is a
 * `<textarea>`, so markup in it is noise rather than content, and Sapo is
 * where the rich version is edited anyway. The HTML is not lost: it stays in
 * `data/sapo/products.json`, and the `Open in Sapo` link goes to the row that
 * owns it.
 *
 * **`status` is `active` for everything.** Sapo has no such field; these
 * products are all published to the storefront, so `active` is the honest
 * reading. `available` is not it — every product reads false because stock is
 * zero store-wide, which says nothing about whether it is listed.
 *
 * **A multi-variant product becomes one row** carrying its first variant's
 * SKU. Seventeen products have more than one variant and backlog `L.3` defers
 * variants entirely; inventing seventeen product rows per colour would put
 * data in the database that the source does not have. The other variants stay
 * in `data/sapo/products.json` for when `L.3` lands.
 *
 * **Rows are inserted directly, not through the repositories.** Two reasons:
 * `sapoId` is deliberately absent from `ProductInput` — it is provenance, and
 * an input field would let the edit form, which knows nothing about it, null
 * it out on the next save — and 832 products one `create()` at a time is
 * thousands of round trips where a chunked insert is a few dozen. The one
 * thing that must not be skipped is `searchText`, so it is computed here with
 * the same `productSearchText` the repository uses.
 *
 * Requires `bun run fetch:sapo --images && bun run prepare:sapo-media` to have
 * produced `data/sapo/media/`. Without it the rows are still written, just
 * with no images, and the count in the summary says so.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type { Kysely } from "kysely";

import type { DB } from "@/lib/db-types";
import type { CategoryId } from "@/lib/domain/categories/entity";
import type { MediaId } from "@/lib/domain/media/entity";
import {
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  type ProductId,
} from "@/lib/domain/products/entity";
import { newId } from "@/lib/id";
import { productSearchText } from "@/lib/search-text";

const DATA = path.join(import.meta.dirname, "..", "..", "data", "sapo");

/** Both drivers bind one parameter per column; a chunk keeps a 832-row insert
 * under SQLite's variable ceiling without anyone having to know what it is. */
const CHUNK = 100;

type SapoProduct = {
  readonly sourceId: number;
  readonly name: string;
  readonly slug: string;
  readonly sku: string | null;
  readonly descriptionHtml: string | null;
  readonly priceMinor: number | null;
  readonly variants: readonly { readonly sku: string | null }[];
};

type SapoCategory = {
  readonly sourceId: number;
  readonly name: string;
  readonly slug: string;
};

type SapoLink = {
  readonly categorySourceId: number;
  readonly productSourceId: number;
};

type SapoMedia = {
  readonly slug: string;
  readonly position: number;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly originFile: string;
  readonly originBytes: number;
  readonly optimizedFile: string;
  readonly optimizedBytes: number;
};

const readJson = async <T>(name: string): Promise<T> =>
  JSON.parse(await fs.readFile(path.join(DATA, name), "utf8")) as T;

/**
 * The product description, as text a person can read in a textarea.
 *
 * Not a sanitiser and not trying to be a parser: the input is a known set of
 * shop descriptions, and the job is to keep the words and the paragraph
 * breaks. Block-level closes become newlines *before* tags are stripped, or
 * every list item runs into the next.
 */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;| /g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Cut at a word boundary and say so, rather than stopping mid-syllable. */
const clamp = (value: string, max: number): string => {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`;
};

const chunked = <T>(rows: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += CHUNK)
    out.push(rows.slice(i, i + CHUNK));
  return out;
};

export type SapoSeedResult = {
  readonly categories: number;
  readonly products: number;
  readonly media: number;
  readonly links: number;
  readonly mediaMissing: boolean;
};

export const seedFromSapo = async (
  db: Kysely<DB>,
  options: {
    /** Where the local driver serves from, or null when the driver is Blob
     * and there is nowhere on disk to put 250 MB of catalogue photographs. */
    readonly storageRoot: string | null;
  },
): Promise<SapoSeedResult> => {
  const [products, categories, links] = await Promise.all([
    readJson<SapoProduct[]>("products.json"),
    readJson<SapoCategory[]>("categories.json"),
    readJson<SapoLink[]>("product-categories.json"),
  ]);

  const media = await readJson<SapoMedia[]>("media.json").catch(() => []);
  const mediaDir = path.join(DATA, "media");
  const havePrepared =
    media.length > 0 &&
    (await fs.stat(mediaDir).then(
      (s) => s.isDirectory(),
      () => false,
    ));
  const writeMedia = havePrepared && options.storageRoot !== null;

  const now = new Date();

  const categoryRows = categories.map((c) => ({
    id: newId(),
    name: clamp(c.name, 60),
    slug: c.slug,
    parentId: null,
    sapoId: String(c.sourceId),
    createdAt: now,
    updatedAt: now,
  }));
  for (const rows of chunked(categoryRows)) {
    await db.insertInto("categories").values(rows).execute();
  }
  const categoryBySapo = new Map(
    categoryRows.map((r) => [r.sapoId, r.id as CategoryId]),
  );

  const productRows = products.map((p) => {
    const description = p.descriptionHtml
      ? clamp(htmlToText(p.descriptionHtml), PRODUCT_DESCRIPTION_MAX)
      : null;
    const name = clamp(p.name, PRODUCT_NAME_MAX);
    // A single-variant product's SKU is the product's; a variant group takes
    // the first, which is what the Sapo list column shows for it too.
    const sku = p.sku ?? p.variants[0]?.sku ?? null;
    const input = {
      name,
      slug: p.slug,
      sku,
      description,
      priceMinor: p.priceMinor ?? 0,
      currency: "VND",
      status: "active",
    };
    return {
      id: newId(),
      ...input,
      sapoId: String(p.sourceId),
      searchText: productSearchText(input),
      createdAt: now,
      updatedAt: now,
    };
  });
  for (const rows of chunked(productRows)) {
    await db.insertInto("products").values(rows).execute();
  }
  const productBySapo = new Map(
    productRows.map((r) => [r.sapoId, r.id as ProductId]),
  );
  const productBySlug = new Map(
    productRows.map((r) => [r.slug, r.id as ProductId]),
  );

  const linkRows = links.flatMap((l) => {
    const productId = productBySapo.get(String(l.productSourceId));
    const categoryId = categoryBySapo.get(String(l.categorySourceId));
    return productId && categoryId ? [{ productId, categoryId }] : [];
  });
  for (const rows of chunked(linkRows)) {
    await db.insertInto("product_categories").values(rows).execute();
  }

  if (!writeMedia) {
    return {
      categories: categoryRows.length,
      products: productRows.length,
      media: 0,
      links: linkRows.length,
      mediaMissing: !havePrepared,
    };
  }

  // `sapo/` rather than `media/<uuid>/`: these keys are the prepared
  // filenames, so the URL in the row reads as the product it belongs to —
  // which is the whole point of naming them after the slug.
  const root = options.storageRoot!;
  const target = path.join(root, "sapo");
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });

  const assetRows = [];
  const mediaLinks = [];
  const byProduct = new Map<string, SapoMedia[]>();
  for (const m of media) {
    const list = byProduct.get(m.slug);
    if (list) list.push(m);
    else byProduct.set(m.slug, [m]);
  }

  for (const [slug, entries] of byProduct) {
    const productId = productBySlug.get(slug);
    if (!productId) continue;
    for (const m of entries.slice().sort((a, b) => a.position - b.position)) {
      await fs.copyFile(
        path.join(mediaDir, m.originFile),
        path.join(target, m.originFile),
      );
      await fs.copyFile(
        path.join(mediaDir, m.optimizedFile),
        path.join(target, m.optimizedFile),
      );
      const mediaId = newId();
      assetRows.push({
        id: mediaId,
        kind: "image",
        originUrl: `/uploads/sapo/${m.originFile}`,
        optimizedUrl: `/uploads/sapo/${m.optimizedFile}`,
        posterUrl: null,
        mime: m.mime,
        bytes: m.originBytes,
        optimizedBytes: m.optimizedBytes,
        width: m.width,
        height: m.height,
        durationMs: null,
        // The product name is a fair description of a catalogue photograph and
        // beats an empty alt; a real one is a human job, per image.
        alt: productRows.find((r) => r.slug === slug)?.name ?? null,
        createdAt: now,
      });
      mediaLinks.push({
        productId,
        mediaId: mediaId as MediaId,
        position: m.position,
      });
    }
  }

  for (const rows of chunked(assetRows)) {
    await db.insertInto("media_assets").values(rows).execute();
  }
  for (const rows of chunked(mediaLinks)) {
    await db.insertInto("product_media").values(rows).execute();
  }

  return {
    categories: categoryRows.length,
    products: productRows.length,
    media: assetRows.length,
    links: linkRows.length,
    mediaMissing: false,
  };
};

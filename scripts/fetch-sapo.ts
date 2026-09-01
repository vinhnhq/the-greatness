/**
 * Pull the live catalogue out of the Sapo store and write it to `data/sapo/`.
 *
 * **Why the storefront API and not the admin one.** `the-greatness.mysapo.net`
 * exposes two JSON surfaces. `/admin/*.json` needs a logged-in session cookie;
 * `/products.json` and `/collections.json` are public and need nothing. The
 * two were compared row by row on 2026-08-30 and the public surface is
 * complete for this store: 832 products either way, and the 280
 * product↔category links match exactly. The admin's extra 832 links all belong
 * to one collection — "Thuế 8%", a tax rule that holds every product and is
 * not a category — and its extra two collections are that one plus another
 * unpublished rule. So the auth-free path loses nothing, and this script can
 * run in CI or on a fresh machine.
 *
 * **Prices are integers in VND minor units.** The API sends floats
 * (`649000.0`); ₫ has no minor unit, so the minor value is the rounded whole
 * number and `lib/money.ts` can take it as-is. A price that is not a whole
 * number of đồng is a bug in the source and throws here rather than silently
 * rounding.
 *
 * Usage:
 *   bun run fetch:sapo              # JSON only
 *   bun run fetch:sapo --images     # ...and download the image originals
 *
 * The images are ~212 MB of full-size CDN originals — `data/sapo/images/` is
 * gitignored for that reason, and this flag is how you get them back.
 */

import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import { assertNoTaxRules, buildCategoryTree } from "@/lib/sapo-tree";

const STORE = "https://the-greatness.mysapo.net";
const OUT = join(import.meta.dirname, "..", "data", "sapo");
const PAGE_SIZE = 250;

/** The CDN 403s a request with no User-Agent. */
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  Accept: "application/json",
};

type Json = Record<string, unknown>;

const getJson = async (path: string): Promise<Json> => {
  const url = path.startsWith("http") ? path : `${STORE}${path}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return (await res.json()) as Json;
    } catch (error) {
      if (attempt >= 3) throw new Error(`GET ${url} failed`, { cause: error });
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
};

/** Every page of a paged storefront collection endpoint, concatenated. */
const getAllPages = async (path: string, key: string): Promise<Json[]> => {
  const all: Json[] = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const body = await getJson(`${path}${sep}limit=${PAGE_SIZE}&page=${page}`);
    const rows = (body[key] ?? []) as Json[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

/** A float from the API into whole đồng, refusing anything that would round. */
const minor = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) return null;
  const rounded = Math.round(asNumber);
  if (Math.abs(asNumber - rounded) > 1e-6) {
    throw new Error(`price ${asNumber} is not a whole number of VND`);
  }
  return rounded;
};

/**
 * A local filename that still reads like the source.
 *
 * The CDN path is not unique on its own once the `?v=` cache-buster is
 * dropped, so an 8-hex digest of the full URL is appended. Truncating the
 * stem keeps the name under every filesystem's limit.
 */
const localName = async (url: string): Promise<string> => {
  const path = new URL(url).pathname;
  const ext = extname(path).toLowerCase() || ".jpg";
  const stem = basename(path, extname(path))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .slice(0, 80);
  const bytes = new TextEncoder().encode(url);
  const hash = await crypto.subtle.digest("SHA-1", bytes);
  const digest = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 8);
  return `${stem}-${digest}${ext}`;
};

const writeJson = async (name: string, value: unknown): Promise<void> => {
  const body = `${JSON.stringify(value, null, 1)}\n`;
  await writeFile(join(OUT, name), body);
  const kb = (Buffer.byteLength(body) / 1024).toFixed(1);
  console.log(`  ${name.padEnd(28)} ${kb.padStart(9)} KB`);
};

/**
 * The storefront HTML, for the one thing the JSON API does not expose.
 *
 * The category hierarchy lives in the theme's menu, not in the collections
 * resource — see `lib/sapo-tree.ts`. Any page carries the whole menu, so the
 * home page is fetched once and read rather than crawled.
 */
const getHtml = async (path: string): Promise<string> => {
  const res = await fetch(`${STORE}${path}`, {
    headers: { ...HEADERS, Accept: "text/html" },
  });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.text();
};

/** Run `task` over `items` with at most `limit` in flight. */
const pooled = async <T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (let i = next++; i < items.length; i = next++) {
        results[i] = await task(items[i]!, i);
      }
    },
  );
  await Promise.all(workers);
  return results;
};

const main = async (): Promise<void> => {
  const wantImages = process.argv.includes("--images");
  await mkdir(join(OUT, "raw"), { recursive: true });

  console.log(`Fetching from ${STORE}`);
  const productsRaw = await getAllPages("/products.json", "products");
  const collectionsRaw = await getAllPages("/collections.json", "collections");
  console.log(
    `  ${productsRaw.length} products, ${collectionsRaw.length} collections`,
  );

  // Membership has no bulk endpoint — it is one request per collection.
  const memberships = await pooled(collectionsRaw, 8, async (collection) => {
    const alias = collection["alias"] as string;
    const rows = await getAllPages(
      `/collections/${alias}/products.json`,
      "products",
    );
    return {
      id: Number(collection["id"]),
      products: rows.map((p) => Number(p["id"])),
    };
  });
  const linkCount = memberships.reduce((n, m) => n + m.products.length, 0);
  console.log(`  ${linkCount} product↔category links`);

  await writeFile(
    join(OUT, "raw", "products.json"),
    `${JSON.stringify({ products: productsRaw }, null, 1)}\n`,
  );
  await writeFile(
    join(OUT, "raw", "collections.json"),
    `${JSON.stringify({ collections: collectionsRaw }, null, 1)}\n`,
  );

  // One entry per distinct image URL. An image can appear on more than one
  // product, so `usedBy` is a list and the file is stored once.
  const imageOrder: string[] = [];
  const imageByUrl = new Map<
    string,
    { url: string; file: string; usedBy: number[] }
  >();
  for (const product of productsRaw) {
    for (const url of (product["images"] ?? []) as string[]) {
      if (imageByUrl.has(url)) continue;
      imageByUrl.set(url, { url, file: await localName(url), usedBy: [] });
      imageOrder.push(url);
    }
  }

  const products = productsRaw.map((p) => {
    const variantsRaw = (p["variants"] ?? []) as Json[];
    const variants = variantsRaw.map((v) => ({
      sourceId: Number(v["id"]),
      title: text(v["title"]),
      sku: text(v["sku"]),
      barcode: text(v["barcode"]),
      unit: text(v["unit"]),
      option1: text(v["option1"]),
      option2: text(v["option2"]),
      option3: text(v["option3"]),
      priceMinor: minor(v["price"]),
      compareAtPriceMinor: minor(v["compare_at_price"]),
      inventoryQuantity: (v["inventory_quantity"] ?? null) as number | null,
      inventoryManagement: text(v["inventory_management"]),
      weight: (v["weight"] ?? null) as number | null,
      weightUnit: text(v["weight_unit"]),
      featuredImage: (v["featured_image"] ?? null) as string | null,
      available: Boolean(v["available"]),
      taxable: Boolean(v["taxable"]),
    }));
    const images = ((p["images"] ?? []) as string[]).map((url, index) => {
      const entry = imageByUrl.get(url)!;
      entry.usedBy.push(Number(p["id"]));
      return { url, file: entry.file, position: index + 1 };
    });
    return {
      sourceId: Number(p["id"]),
      name: String(p["name"]).trim(),
      slug: String(p["alias"]),
      // Only meaningful when the product is not a variant group.
      sku: variants.length === 1 ? variants[0]!.sku : null,
      vendor: text(p["vendor"]),
      productType: text(p["product_type"]),
      summary: text(p["summary"]),
      descriptionHtml: text(p["content"]),
      currency: "VND",
      priceMinor: minor(p["price"]),
      priceMinMinor: minor(p["price_min"]),
      priceMaxMinor: minor(p["price_max"]),
      compareAtPriceMinor: minor(p["compare_at_price_min"]) || null,
      priceVaries: Boolean(p["price_varies"]),
      available: Boolean(p["available"]),
      tags: (p["tags"] ?? []) as string[],
      options: (p["options"] ?? []) as Json[],
      featuredImage: (p["featured_image"] ?? null) as string | null,
      images,
      variants,
      sourceUrl: `${STORE}${p["url"]}`,
    };
  });

  const countById = new Map(memberships.map((m) => [m.id, m.products.length]));
  const categories = collectionsRaw.map((c) => ({
    sourceId: Number(c["id"]),
    name: String(c["name"]).trim(),
    slug: String(c["alias"]),
    description: text(c["description"]),
    metaTitle: text(c["meta_title"]),
    metaDescription: text(c["meta_description"]),
    sortOrder: (c["sort_order"] ?? null) as string | null,
    createdOn: (c["created_on"] ?? null) as string | null,
    publishedOn: (c["published_on"] ?? null) as string | null,
    productCount: countById.get(Number(c["id"])) ?? 0,
  }));

  const links = memberships
    .slice()
    .sort((a, b) => a.id - b.id)
    .flatMap((m) =>
      m.products.map((productSourceId) => ({
        categorySourceId: m.id,
        productSourceId,
      })),
    );

  // The hierarchy, reconstructed from the storefront menu plus creation
  // order. It is written as a reviewable artifact rather than derived at seed
  // time, because it is the one part of this snapshot that is inferred rather
  // than fetched, and a diff on it is how a theme change becomes visible.
  console.log("Deriving the category tree");
  assertNoTaxRules(categories);
  const menuHtml = await getHtml("/");
  const tree = buildCategoryTree(categories, menuHtml, {
    knownMaxSourceId: Math.max(...categories.map((c) => c.sourceId)),
  });
  console.log(
    `  ${tree.counts.roots} roots · ${tree.counts.mid} mid · ` +
      `${tree.counts.leaves} leaves · ${tree.counts.unfiled} unfiled` +
      ` = ${tree.counts.roots + tree.counts.mid + tree.counts.leaves + tree.counts.unfiled} of ${categories.length}`,
  );

  console.log("Writing");
  await writeJson("products.json", products);
  await writeJson("categories.json", categories);
  await writeJson("category-tree.json", tree);
  await writeJson("product-categories.json", links);
  await writeJson(
    "images.json",
    imageOrder.map((url) => imageByUrl.get(url)!),
  );

  if (!wantImages) {
    console.log(
      `\nDone. ${imageByUrl.size} images left as URLs — pass --images to download them.`,
    );
    return;
  }

  const dir = join(OUT, "images");
  await mkdir(dir, { recursive: true });
  const entries = [...imageByUrl.values()];
  let done = 0;
  let skipped = 0;
  let bytes = 0;
  const failures: string[] = [];
  console.log(`Downloading ${entries.length} images to data/sapo/images/`);
  await pooled(entries, 12, async (entry) => {
    const target = join(dir, entry.file);
    if (existsSync(target)) {
      // `bytes += await …` would read `bytes` before the await and lose
      // updates across the 12 concurrent workers. Resolve first, then add.
      const existing = await stat(target);
      skipped++;
      bytes += existing.size;
      return;
    }
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(entry.url, { headers: HEADERS });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        await writeFile(target, buffer);
        bytes += buffer.byteLength;
        break;
      } catch (error) {
        if (attempt >= 3) {
          failures.push(`${entry.url}: ${String(error)}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
    if (++done % 100 === 0) console.log(`  ${done} downloaded`);
  });
  console.log(
    `\nDone. ${done} downloaded, ${skipped} already present, ` +
      `${(bytes / 1024 / 1024).toFixed(1)} MB on disk.`,
  );
  if (failures.length > 0) {
    console.error(`${failures.length} failed:`);
    for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
    process.exitCode = 1;
  }
};

await main();

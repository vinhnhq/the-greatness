/**
 * `bun run seed` — an operator, eight categories and thirty products.
 *
 * Not decoration. An empty dashboard hides everything that only shows up with
 * data: whether paging works (thirty rows against a page size of twenty-five
 * means there is a second page), whether the status filter has anything to
 * filter, whether a Vietnamese product name renders and searches correctly,
 * and whether a row with no image looks deliberate rather than broken.
 *
 * Idempotent: re-running replaces the seeded rows rather than doubling them,
 * so it is safe to run against a database you have been clicking around in.
 * `bun run db:reset` is the sledgehammer.
 *
 * Most products get a **generated placeholder image** (`seed-media.ts`), so
 * `/gallery` and the list's thumbnail column mean something on a fresh clone.
 * A few are deliberately left without one — a row with no image has to look
 * deliberate rather than broken, and that is only visible when some rows have
 * one and some do not.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { runWithContext } from "@/lib/context";
import { createDb } from "@/lib/db";
import { getDatabaseDriver, getSqliteFile } from "@/lib/db-url";
import type { CategoryId } from "@/lib/domain/categories/entity";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import type { MediaId } from "@/lib/domain/media/entity";
import type { ProductStatus } from "@/lib/domain/products/entity";
import { dbProductRepo } from "@/lib/domain/products/repository";
import { newId } from "@/lib/id";
import type { Currency } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { getLocalStorageDir, getStorageDriver } from "@/lib/storage/config";

import { writePlaceholder } from "./seed-media";

export const SEED_OPERATOR_EMAIL = "operator@the-greatness.local";

const CATEGORIES = [
  "Bags",
  "Ceramics",
  "Lighting",
  "Textiles",
  "Stationery",
  "Kitchen",
  "Áo dài",
  "Đồ gỗ",
];

type SeedProduct = {
  readonly name: string;
  readonly sku: string;
  readonly description: string;
  readonly priceMinor: number;
  readonly currency: Currency;
  readonly status: ProductStatus;
  readonly categories: readonly string[];
};

/**
 * Deliberately uneven: mostly `active` so the default view has content, a
 * handful of drafts and archives so both filters return something, prices
 * spanning four orders of magnitude so the price sort is visibly doing
 * something, and Vietnamese names so search is exercised on the data it will
 * actually meet.
 */
const PRODUCTS: readonly SeedProduct[] = [
  [
    "Leather Tote Bag",
    "TOTE-01",
    "Full-grain leather, hand-stitched.",
    1_850_000,
    "active",
    ["Bags"],
  ],
  [
    "Canvas Weekender",
    "TOTE-02",
    "Waxed canvas with leather trim.",
    2_400_000,
    "active",
    ["Bags", "Textiles"],
  ],
  [
    "Woven Market Basket",
    "BSK-01",
    "Seagrass, woven in Ninh Bình.",
    420_000,
    "active",
    ["Bags"],
  ],
  [
    "Crossbody Pouch",
    "TOTE-03",
    "Minimal everyday carry.",
    690_000,
    "draft",
    ["Bags"],
  ],
  [
    "Stoneware Dinner Plate",
    "CER-01",
    "Reactive glaze, no two alike.",
    320_000,
    "active",
    ["Ceramics", "Kitchen"],
  ],
  [
    "Stoneware Bowl",
    "CER-02",
    "Deep bowl for noodles or pho.",
    280_000,
    "active",
    ["Ceramics", "Kitchen"],
  ],
  [
    "Ceramic Vase — Tall",
    "CER-03",
    "Matte white, hand thrown.",
    950_000,
    "active",
    ["Ceramics"],
  ],
  [
    "Ceramic Vase — Squat",
    "CER-04",
    "Matte charcoal, hand thrown.",
    870_000,
    "archived",
    ["Ceramics"],
  ],
  [
    "Đèn Bàn Gỗ",
    "LGT-01",
    "Đèn bàn gỗ sồi, chụp vải lanh.",
    1_240_000,
    "active",
    ["Lighting", "Đồ gỗ"],
  ],
  [
    "Paper Pendant Lamp",
    "LGT-02",
    "Washi paper over a steel frame.",
    780_000,
    "active",
    ["Lighting"],
  ],
  [
    "Brass Reading Lamp",
    "LGT-03",
    "Solid brass, adjustable arm.",
    3_150_000,
    "active",
    ["Lighting"],
  ],
  [
    "Linen Throw",
    "TXT-01",
    "Stonewashed linen, 130×180.",
    1_100_000,
    "active",
    ["Textiles"],
  ],
  [
    "Cotton Napkin Set",
    "TXT-02",
    "Set of four, 100% cotton.",
    340_000,
    "active",
    ["Textiles", "Kitchen"],
  ],
  [
    "Áo Dài Lụa Truyền Thống",
    "ADL-01",
    "Lụa tơ tằm Hà Đông, may đo.",
    4_800_000,
    "active",
    ["Áo dài", "Textiles"],
  ],
  [
    "Áo Dài Cách Tân",
    "ADL-02",
    "Kiểu dáng hiện đại, vải gấm.",
    3_600_000,
    "active",
    ["Áo dài"],
  ],
  [
    "Áo Dài Trẻ Em",
    "ADL-03",
    "Cho bé từ 4 đến 10 tuổi.",
    1_450_000,
    "draft",
    ["Áo dài"],
  ],
  [
    "Notebook — Ruled",
    "STA-01",
    "128 pages, sewn binding.",
    145_000,
    "active",
    ["Stationery"],
  ],
  [
    "Notebook — Blank",
    "STA-02",
    "128 pages, sewn binding.",
    145_000,
    "active",
    ["Stationery"],
  ],
  [
    "Fountain Pen",
    "STA-03",
    "Steel nib, converter included.",
    890_000,
    "active",
    ["Stationery"],
  ],
  [
    "Desk Blotter",
    "STA-04",
    "Vegetable-tanned leather.",
    1_320_000,
    "archived",
    ["Stationery", "Đồ gỗ"],
  ],
  [
    "Wooden Chopping Board",
    "KIT-01",
    "End-grain acacia.",
    620_000,
    "active",
    ["Kitchen", "Đồ gỗ"],
  ],
  [
    "Cast Iron Skillet",
    "KIT-02",
    "26cm, pre-seasoned.",
    1_150_000,
    "active",
    ["Kitchen"],
  ],
  [
    "Enamel Kettle",
    "KIT-03",
    "1.5L, gas and induction.",
    980_000,
    "active",
    ["Kitchen"],
  ],
  [
    "Bamboo Utensil Set",
    "KIT-04",
    "Six pieces, oiled bamboo.",
    260_000,
    "active",
    ["Kitchen"],
  ],
  [
    "Gỗ Sồi Coffee Table",
    "WD-01",
    "Bàn cà phê gỗ sồi tự nhiên.",
    6_900_000,
    "active",
    ["Đồ gỗ"],
  ],
  [
    "Walnut Side Table",
    "WD-02",
    "Solid walnut, oil finish.",
    4_200_000,
    "active",
    ["Đồ gỗ"],
  ],
  [
    "Oak Bookshelf",
    "WD-03",
    "Five shelves, flat-packed.",
    8_400_000,
    "draft",
    ["Đồ gỗ"],
  ],
  [
    "Teak Stool",
    "WD-04",
    "Reclaimed teak, each unique.",
    1_950_000,
    "active",
    ["Đồ gỗ"],
  ],
  [
    "Ceramic Mug",
    "CER-05",
    "300ml, dishwasher safe.",
    180_000,
    "active",
    ["Ceramics", "Kitchen"],
  ],
  [
    "Ceramic Teapot",
    "CER-06",
    "600ml with a steel infuser.",
    740_000,
    "active",
    ["Ceramics", "Kitchen"],
  ],
].map(([name, sku, description, priceMinor, status, categories]) => ({
  name: name as string,
  sku: sku as string,
  description: description as string,
  priceMinor: priceMinor as number,
  currency: "VND" as Currency,
  status: status as ProductStatus,
  categories: categories as readonly string[],
}));

const main = async (): Promise<void> => {
  if (getDatabaseDriver() === "sqlite") {
    await fs.mkdir(path.dirname(path.resolve(getSqliteFile())), {
      recursive: true,
    });
  }

  const db = createDb();

  await runWithContext({ db, user: null, requestId: "seed" }, async () => {
    // Wipe only what the seed owns. Doing this by table rather than by a
    // marker column is fine because seeding is a development action against a
    // development database — the migrate runner is what guards a real one.
    await db.deleteFrom("product_media").execute();
    await db.deleteFrom("media_assets").execute();
    await db.deleteFrom("product_categories").execute();
    await db.deleteFrom("products").execute();
    await db.deleteFrom("categories").execute();

    const now = new Date();
    const operator = await db
      .selectFrom("users")
      .select("id")
      .where("email", "=", SEED_OPERATOR_EMAIL)
      .executeTakeFirst();

    if (!operator) {
      await db
        .insertInto("users")
        .values({
          id: newId(),
          email: SEED_OPERATOR_EMAIL,
          emailVerified: 1,
          name: "Seeded Operator",
          image: null,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    const byName = new Map<string, CategoryId>();
    for (const name of CATEGORIES) {
      const category = await dbCategoryRepo.create({
        name,
        slug: slugify(name),
      });
      byName.set(name, category.id);
    }

    // Placeholders are files on disk, so they only make sense for the local
    // driver. Seeding generated squares into a real Blob store is not
    // something to do by accident.
    const canWriteMedia = getStorageDriver() === "local";
    const storageRoot = path.resolve(getLocalStorageDir());
    if (canWriteMedia) {
      await fs.rm(path.join(storageRoot, "media"), {
        recursive: true,
        force: true,
      });
      // The pre-v2 layout, cleared too so a reseed does not leave the old
      // shape behind on a machine that ran the earlier seed.
      await fs.rm(path.join(storageRoot, "products"), {
        recursive: true,
        force: true,
      });
    }

    let mediaCount = 0;
    for (const [index, seed] of PRODUCTS.entries()) {
      const product = await dbProductRepo.create({
        name: seed.name,
        slug: slugify(seed.name),
        sku: seed.sku,
        description: seed.description,
        priceMinor: seed.priceMinor,
        currency: seed.currency,
        status: seed.status,
      });
      await dbProductRepo.setCategories(
        product.id,
        seed.categories.flatMap((name) => {
          const id = byName.get(name);
          return id ? [id] : [];
        }),
      );

      // Every fourth product is left bare, on purpose — see the docblock.
      if (!canWriteMedia || index % 4 === 3) continue;

      // One or two images, so the gallery has products with a set rather than
      // a uniform one-each grid.
      const howMany = index % 3 === 0 ? 2 : 1;
      const assets = [];
      for (let n = 0; n < howMany; n++) {
        const mediaId = newId();
        const file = await writePlaceholder(
          storageRoot,
          mediaId,
          `${seed.sku}-${n}`,
        );
        assets.push({
          id: mediaId,
          kind: "image" as const,
          originUrl: file.originUrl,
          optimizedUrl: file.optimizedUrl,
          posterUrl: null,
          mime: "image/png",
          bytes: file.bytes,
          optimizedBytes: file.optimizedBytes,
          width: file.width,
          height: file.height,
          durationMs: null,
          alt: n === 0 ? seed.name : `${seed.name}, detail`,
          createdAt: now,
        });
        mediaCount += 1;
      }
      await db.insertInto("media_assets").values(assets).execute();
      await dbProductRepo.setMedia(
        product.id,
        assets.map((a) => a.id as MediaId),
      );
    }

    // A handful of unattached assets, so the library has something the
    // "Unused" filter can find and the gallery is not just a mirror of the
    // product list.
    if (canWriteMedia) {
      const loose = [];
      for (let n = 0; n < 6; n++) {
        const mediaId = newId();
        const file = await writePlaceholder(storageRoot, mediaId, `loose-${n}`);
        loose.push({
          id: mediaId,
          kind: "image" as const,
          originUrl: file.originUrl,
          optimizedUrl: file.optimizedUrl,
          posterUrl: null,
          mime: "image/png",
          bytes: file.bytes,
          optimizedBytes: file.optimizedBytes,
          width: file.width,
          height: file.height,
          durationMs: null,
          alt: null,
          createdAt: now,
        });
        mediaCount += 1;
      }
      await db.insertInto("media_assets").values(loose).execute();
    }

    console.log(
      `seeded: 1 operator (${SEED_OPERATOR_EMAIL}) · ${CATEGORIES.length} categories · ${PRODUCTS.length} products · ${mediaCount} images`,
    );
    if (!canWriteMedia) {
      console.log(
        "STORAGE_DRIVER is not `local`, so no placeholder images were written.",
      );
    }
  });

  await db.destroy();
};

await main();

/**
 * Every attachment in the catalogue, with the product it belongs to.
 *
 * A separate read model from `ProductRepository` rather than a flag on it,
 * because the gallery inverts the relationship: the product list is products
 * that happen to carry media, and this is media that happens to belong to a
 * product. Trying to serve both from `list()` would mean a method whose
 * return shape depended on an argument.
 *
 * One JOIN, one query. The alternative — page the attachments, then look up
 * each one's product — is sixty round-trips for one screen, and it is the
 * exact shape that looks fine on a seeded database and falls over on a real
 * one.
 */

import { readContext } from "@/lib/context";
import type { Currency } from "@/lib/money";

import {
  type Attachment,
  displayUrl,
  parseAttachmentStrict,
  type ProductId,
  type ProductStatus,
} from "./entity";
import { MEDIA_PAGE_SIZE, type MediaQuery } from "./media-query";

/** One tile in the grid: the attachment plus enough of its product to caption
 * it and link back, so the viewer needs no second query. */
export type MediaItem = {
  readonly attachment: Attachment;
  /** What the tile and the viewer render — optimized, or the poster for a
   * video, falling back to the origin. */
  readonly src: string;
  readonly product: {
    readonly id: ProductId;
    readonly name: string;
    readonly slug: string;
    readonly priceMinor: number;
    readonly currency: Currency;
    readonly status: ProductStatus;
  };
};

export type MediaPage = {
  readonly items: readonly MediaItem[];
  readonly total: number;
  /** Totals per kind, for the filter's counts. Computed alongside the page
   * because "Videos (3)" is the only thing that tells someone the tab is
   * worth pressing. */
  readonly counts: {
    readonly all: number;
    readonly image: number;
    readonly video: number;
  };
};

export type MediaRepository = {
  list(query: MediaQuery): Promise<MediaPage>;
  /** Products that actually have media — the filter should not offer the
   * twenty-seven products that would return an empty grid. */
  productsWithMedia(): Promise<
    readonly { readonly id: ProductId; readonly name: string }[]
  >;
};

export const dbMediaRepo: MediaRepository = {
  list: async (query) => {
    const { db } = await readContext();

    const base = () => {
      let q = db
        .selectFrom("product_attachments")
        .innerJoin("products", "products.id", "product_attachments.productId");
      if (query.productId) {
        q = q.where("product_attachments.productId", "=", query.productId);
      }
      return q;
    };

    // Counts for all three tabs in one pass, rather than three queries: SUM
    // over a CASE is cheaper than re-scanning per kind, and it keeps the
    // numbers consistent with each other under concurrent writes.
    const countRow = await base()
      .select((eb) => [
        eb.fn.countAll<number>().as("all"),
        eb.fn
          .sum<number>(
            eb
              .case()
              .when("product_attachments.kind", "=", "image")
              .then(1)
              .else(0)
              .end(),
          )
          .as("image"),
        eb.fn
          .sum<number>(
            eb
              .case()
              .when("product_attachments.kind", "=", "video")
              .then(1)
              .else(0)
              .end(),
          )
          .as("video"),
      ])
      .executeTakeFirst();

    const counts = {
      all: Number(countRow?.all ?? 0),
      image: Number(countRow?.image ?? 0),
      video: Number(countRow?.video ?? 0),
    };

    let paged = base();
    if (query.kind !== "all") {
      paged = paged.where("product_attachments.kind", "=", query.kind);
    }

    const rows = await paged
      .select([
        "product_attachments.id as id",
        "product_attachments.productId as productId",
        "product_attachments.kind as kind",
        "product_attachments.originUrl as originUrl",
        "product_attachments.optimizedUrl as optimizedUrl",
        "product_attachments.posterUrl as posterUrl",
        "product_attachments.mime as mime",
        "product_attachments.bytes as bytes",
        "product_attachments.optimizedBytes as optimizedBytes",
        "product_attachments.width as width",
        "product_attachments.height as height",
        "product_attachments.durationMs as durationMs",
        "product_attachments.position as position",
        "product_attachments.alt as alt",
        "product_attachments.createdAt as createdAt",
        "products.name as productName",
        "products.slug as productSlug",
        "products.priceMinor as priceMinor",
        "products.currency as currency",
        "products.status as status",
      ])
      // Newest first, the way a photo library reads. `id` is a uuid v7, so
      // the tiebreaker is chronological rather than arbitrary — without it,
      // media uploaded in the same second can swap between pages.
      .orderBy("product_attachments.createdAt", "desc")
      .orderBy("product_attachments.id", "desc")
      .limit(MEDIA_PAGE_SIZE)
      .offset((query.page - 1) * MEDIA_PAGE_SIZE)
      .execute();

    const items = rows.map((row) => {
      const attachment = parseAttachmentStrict(row);
      return {
        attachment,
        src: displayUrl(attachment),
        product: {
          id: row.productId as ProductId,
          name: row.productName,
          slug: row.productSlug,
          priceMinor: Number(row.priceMinor),
          currency: row.currency as Currency,
          status: row.status as ProductStatus,
        },
      };
    });

    return {
      items,
      total: query.kind === "all" ? counts.all : counts[query.kind],
      counts,
    };
  },

  productsWithMedia: async () => {
    const { db } = await readContext();
    const rows = await db
      .selectFrom("products")
      .select(["products.id", "products.name"])
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("product_attachments")
            .select("id")
            .whereRef("product_attachments.productId", "=", "products.id"),
        ),
      )
      .orderBy("products.name", "asc")
      .execute();
    return rows.map((r) => ({ id: r.id as ProductId, name: r.name }));
  },
};

/**
 * Group a page of media by the month it was added, newest first.
 *
 * Pure, so it is unit-tested rather than eyeballed. This is the detail that
 * makes a grid read like a photo library instead of a spreadsheet of images:
 * a date to anchor against while scrolling. The rows arrive already sorted
 * newest-first, so grouping is a fold rather than a sort.
 */

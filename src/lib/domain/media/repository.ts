/**
 * The media library.
 *
 * Reads and writes `media_assets`, and answers the one question a library has
 * that a per-product attachment list never did: **what is using this?**
 * Deleting from a library without saying "this is on three products" is a
 * trap, and the count has to come from the same query as the page or the
 * warning is stale by the time it is read.
 */

import { readContext } from "@/lib/context";
import { newId } from "@/lib/id";

import type { ProductId } from "../products/entity";
import {
  type MediaAsset,
  type MediaId,
  mediaSrc,
  type NewMediaAsset,
  parseMediaAssetStrict,
} from "./entity";
import { MEDIA_PAGE_SIZE, type MediaQuery } from "./query";

/** An asset as the gallery shows it: the row, what to render, and who uses it. */
export type LibraryItem = {
  readonly asset: MediaAsset;
  readonly src: string;
  /** The products linking to this asset. Empty is normal — an asset uploaded
   * in the gallery belongs to nothing until someone attaches it. */
  readonly usedBy: readonly {
    readonly id: ProductId;
    readonly name: string;
  }[];
};

export type LibraryPage = {
  readonly items: readonly LibraryItem[];
  readonly total: number;
  readonly counts: {
    readonly all: number;
    readonly image: number;
    readonly video: number;
    /** Uploaded but attached to nothing. Its own filter, because "what have I
     * not used yet" is the question a library gets asked most. */
    readonly unused: number;
  };
};

export type MediaRepository = {
  list(query: MediaQuery): Promise<LibraryPage>;
  getMany(ids: readonly MediaId[]): Promise<readonly MediaAsset[]>;
  /**
   * Bulk insert — one statement, because a batch upload of twenty files
   * should not be twenty round-trips.
   *
   * Returns them in the **input order**, so a caller can match each result to
   * the file it uploaded by position. Sorting the result here would be
   * convenient for the gallery and wrong for everyone else; the gallery
   * orders its own page.
   */
  createMany(assets: readonly NewMediaAsset[]): Promise<readonly MediaAsset[]>;
  updateAlt(id: MediaId, alt: string | null): Promise<MediaAsset | null>;
  /** Removes the assets **and every link to them**, so no product is left
   * pointing at a row that no longer exists. The stored files are left — see
   * backlog N.2. */
  remove(ids: readonly MediaId[]): Promise<void>;
  /** Products that have at least one asset — the gallery's product filter. */
  productsWithMedia(): Promise<
    readonly { readonly id: ProductId; readonly name: string }[]
  >;
};

export const dbMediaRepo: MediaRepository = {
  list: async (query) => {
    const { db } = await readContext();

    // Counts for every tab in one pass. Three queries would be three chances
    // for the numbers to disagree with each other under a concurrent upload,
    // and the tabs are read as a set.
    const countRow = await db
      .selectFrom("media_assets")
      .select((eb) => [
        eb.fn.countAll<number>().as("all"),
        eb.fn
          .sum<number>(
            eb.case().when("kind", "=", "image").then(1).else(0).end(),
          )
          .as("image"),
        eb.fn
          .sum<number>(
            eb.case().when("kind", "=", "video").then(1).else(0).end(),
          )
          .as("video"),
        eb.fn
          .sum<number>(
            eb
              .case()
              .when(
                eb.exists(
                  eb
                    .selectFrom("product_media")
                    .select("mediaId")
                    .whereRef("product_media.mediaId", "=", "media_assets.id"),
                ),
              )
              .then(0)
              .else(1)
              .end(),
          )
          .as("unused"),
      ])
      .executeTakeFirst();

    const counts = {
      all: Number(countRow?.all ?? 0),
      image: Number(countRow?.image ?? 0),
      video: Number(countRow?.video ?? 0),
      unused: Number(countRow?.unused ?? 0),
    };

    let q = db.selectFrom("media_assets").selectAll();
    if (query.kind !== "all") q = q.where("kind", "=", query.kind);
    if (query.unusedOnly) {
      q = q.where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom("product_media")
              .select("mediaId")
              .whereRef("product_media.mediaId", "=", "media_assets.id"),
          ),
        ),
      );
    }
    if (query.productId) {
      const productId = query.productId as string;
      q = q.where((eb) =>
        eb.exists(
          eb
            .selectFrom("product_media")
            .select("mediaId")
            .whereRef("product_media.mediaId", "=", "media_assets.id")
            .where("product_media.productId", "=", productId),
        ),
      );
    }

    // The filtered total has to be counted with the same predicates, or the
    // pager offers pages that render empty. Re-running the builder is the
    // cheapest way to guarantee they cannot drift apart.
    const filteredTotal = await (query.kind === "all" &&
    !query.unusedOnly &&
    !query.productId
      ? Promise.resolve(counts.all)
      : q
          .clearSelect()
          .select((eb) => eb.fn.countAll<number>().as("n"))
          .executeTakeFirst()
          .then((row) => Number(row?.n ?? 0)));

    const rows = await q
      // Newest first, the way a photo library reads. `id` is a uuid v7, so
      // the tiebreaker is chronological rather than arbitrary — without it,
      // assets from one batch upload can swap between pages.
      .orderBy("createdAt", "desc")
      .orderBy("id", "desc")
      .limit(MEDIA_PAGE_SIZE)
      .offset((query.page - 1) * MEDIA_PAGE_SIZE)
      .execute();

    const assets = rows.map(parseMediaAssetStrict);
    const ids = assets.map((a) => a.id as string);

    // One query for every link on the page, not one per tile.
    const links =
      ids.length === 0
        ? []
        : await db
            .selectFrom("product_media")
            .innerJoin("products", "products.id", "product_media.productId")
            .select([
              "product_media.mediaId as mediaId",
              "products.id as productId",
              "products.name as productName",
            ])
            .where("product_media.mediaId", "in", ids)
            .orderBy("products.name", "asc")
            .execute();

    const usedBy = new Map<
      string,
      { readonly id: ProductId; readonly name: string }[]
    >();
    for (const link of links) {
      const list = usedBy.get(link.mediaId) ?? [];
      list.push({ id: link.productId as ProductId, name: link.productName });
      usedBy.set(link.mediaId, list);
    }

    return {
      total: filteredTotal,
      counts,
      items: assets.map((asset) => ({
        asset,
        src: mediaSrc(asset),
        usedBy: usedBy.get(asset.id) ?? [],
      })),
    };
  },

  getMany: async (ids) => {
    if (ids.length === 0) return [];
    const { db } = await readContext();
    const rows = await db
      .selectFrom("media_assets")
      .selectAll()
      .where("id", "in", [...ids] as string[])
      .execute();
    return rows.map(parseMediaAssetStrict);
  },

  createMany: async (assets) => {
    if (assets.length === 0) return [];
    const { db } = await readContext();
    const now = new Date();
    // Ids are minted here so the returned rows can be matched back to their
    // inputs by id rather than trusting RETURNING's row order, which no
    // driver guarantees.
    const values = assets.map((a) => ({ id: newId(), ...a, createdAt: now }));
    const rows = await db
      .insertInto("media_assets")
      .values(values)
      .returningAll()
      .execute();

    const byId = new Map(
      rows.map((row) => {
        const asset = parseMediaAssetStrict(row);
        return [asset.id as string, asset];
      }),
    );
    return values.flatMap((v) => {
      const asset = byId.get(v.id);
      return asset ? [asset] : [];
    });
  },

  updateAlt: async (id, alt) => {
    const { db } = await readContext();
    const row = await db
      .updateTable("media_assets")
      .set({ alt })
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst();
    return row ? parseMediaAssetStrict(row) : null;
  },

  remove: async (ids) => {
    if (ids.length === 0) return;
    const { db } = await readContext();
    // Links first: an asset row deleted while its links survive leaves every
    // product using it rendering a broken image with nothing in the UI able
    // to name the cause.
    await db
      .deleteFrom("product_media")
      .where("mediaId", "in", [...ids] as string[])
      .execute();
    await db
      .deleteFrom("media_assets")
      .where("id", "in", [...ids] as string[])
      .execute();
  },

  productsWithMedia: async () => {
    const { db } = await readContext();
    const rows = await db
      .selectFrom("products")
      .select(["products.id", "products.name"])
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom("product_media")
            .select("mediaId")
            .whereRef("product_media.productId", "=", "products.id"),
        ),
      )
      .orderBy("products.name", "asc")
      .execute();
    return rows.map((r) => ({ id: r.id as ProductId, name: r.name }));
  },
};

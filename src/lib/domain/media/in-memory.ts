/**
 * The library's in-memory twin, for unit tests.
 *
 * In its own file rather than beside `dbMediaRepo`: the save operation's tests
 * import it, and those run in a plain Node environment. A twin sharing a file
 * with the repository would drag `readContext` → `db.ts` → `node:async_hooks`
 * into every test that only wanted an array.
 *
 * It reimplements the same rules the SQL side enforces, which is duplication
 * with a purpose — the unit tests run in milliseconds, and where the two
 * disagree, the integration suite against the real driver is what catches it.
 */

import { newId } from "@/lib/id";

import type { ProductId } from "../products/entity";
import {
  type MediaAsset,
  type MediaId,
  mediaSrc,
  type NewMediaAsset,
} from "./entity";
import { MEDIA_PAGE_SIZE } from "./query";
import type { LibraryItem, MediaRepository } from "./repository";

export const createInMemoryMediaRepo = (
  now: () => Date = () => new Date(0),
): MediaRepository & {
  readonly seed: (assets: readonly MediaAsset[]) => void;
  /** mediaId → the products linking to it, so `usedBy` and the unused filter
   * have something to answer from. */
  readonly links: Map<string, { id: ProductId; name: string }[]>;
} => {
  const assets: MediaAsset[] = [];
  const links = new Map<string, { id: ProductId; name: string }[]>();

  const usedBy = (id: string) => links.get(id) ?? [];
  const toItem = (asset: MediaAsset): LibraryItem => ({
    asset,
    src: mediaSrc(asset),
    usedBy: usedBy(asset.id),
  });

  const repo: MediaRepository = {
    list: async (query) => {
      const counts = {
        all: assets.length,
        image: assets.filter((a) => a.kind === "image").length,
        video: assets.filter((a) => a.kind === "video").length,
        unused: assets.filter((a) => usedBy(a.id).length === 0).length,
      };

      const filtered = assets.filter((a) => {
        if (query.kind !== "all" && a.kind !== query.kind) return false;
        if (query.unusedOnly && usedBy(a.id).length > 0) return false;
        if (query.productId) {
          if (!usedBy(a.id).some((p) => p.id === query.productId)) return false;
        }
        return true;
      });

      // Newest first, `id` descending as the tiebreaker — the same order the
      // SQL side produces, and the reason it matters is paging.
      const sorted = [...filtered].sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      );
      const start = (query.page - 1) * MEDIA_PAGE_SIZE;

      return {
        counts,
        total: filtered.length,
        items: sorted.slice(start, start + MEDIA_PAGE_SIZE).map(toItem),
      };
    },

    getMany: async (ids) => {
      const wanted = new Set([...ids] as string[]);
      return assets.filter((a) => wanted.has(a.id));
    },

    createMany: async (input) => {
      const stamp = now();
      const created = input.map((a: NewMediaAsset) => ({
        ...a,
        id: newId() as MediaId,
        createdAt: stamp,
      }));
      assets.push(...created);
      // Input order, matching the SQL side's contract.
      return created;
    },

    updateAlt: async (id, alt) => {
      const index = assets.findIndex((a) => a.id === id);
      if (index === -1) return null;
      assets[index] = { ...assets[index], alt };
      return assets[index];
    },

    remove: async (ids) => {
      const doomed = new Set([...ids] as string[]);
      for (let i = assets.length - 1; i >= 0; i--) {
        if (doomed.has(assets[i].id)) assets.splice(i, 1);
      }
      // Links go with them, same as the SQL side — no product may be left
      // pointing at a row that no longer exists.
      for (const id of doomed) links.delete(id);
    },

    productsWithMedia: async () => {
      const byId = new Map<string, { id: ProductId; name: string }>();
      for (const list of links.values()) {
        for (const product of list) byId.set(product.id, product);
      }
      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
    },
  };

  return {
    ...repo,
    links,
    seed: (seeded) => {
      assets.push(...seeded);
    },
  };
};

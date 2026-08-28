/**
 * Grouping a page of media by month — the pure half of the gallery.
 *
 * **In its own file for a load-bearing reason.** The grid is a client
 * component. When this lived in `media-repository.ts`, importing
 * `groupByMonth` pulled that module's `readContext` import, and through it
 * `db.ts`, `node:async_hooks` and the Neon driver, into the browser bundle —
 * which failed the route's build outright rather than degrading. A pure
 * function used by a client component cannot share a file with a repository.
 *
 * The `MediaItem` import below is **type-only** and therefore erased; making
 * it a value import would reintroduce exactly the problem this file exists to
 * solve.
 */

import type { MediaItem } from "./media-repository";

/**
 * An item together with its position in the **flat** page.
 *
 * The index is carried rather than counted at render time for two reasons.
 * The viewer navigates across the whole page, not within a month, so "next"
 * has to mean the next photo — a per-group index would stop at each month
 * boundary. And a counter incremented inside JSX is a mutation during render:
 * React may discard that pass, and the compiler rejects it.
 */
export type MediaGroupItem = {
  readonly item: MediaItem;
  readonly index: number;
};

export type MediaGroup = {
  /** Stable key — `2026-08`, not a formatted label, so the render site owns
   * the wording and a test can assert on something that will not drift. */
  readonly key: string;
  readonly items: readonly MediaGroupItem[];
};

/**
 * Group a page of media by the month it was added, newest first.
 *
 * This is the detail that makes a grid read like a photo library instead of a
 * spreadsheet of images: a date to anchor against while scrolling. The rows
 * arrive already sorted newest-first, so grouping is a fold rather than a sort.
 */
export const groupByMonth = (
  items: readonly MediaItem[],
): readonly MediaGroup[] => {
  const groups: MediaGroup[] = [];
  for (const [index, item] of items.entries()) {
    const d = item.attachment.createdAt;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const last = groups.at(-1);
    if (last?.key === key) {
      (last.items as MediaGroupItem[]).push({ item, index });
    } else {
      groups.push({ key, items: [{ item, index }] });
    }
  }
  return groups;
};

/**
 * `2026-08` → `August 2026`.
 *
 * `Date.UTC` and an explicit `timeZone`, because the naive
 * `new Date(2026, 0, 1)` lands in December for any reader west of UTC — a
 * heading off by a month, only for some people.
 */
export const monthLabel = (key: string, locale = "en-GB"): string => {
  const [year, month] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

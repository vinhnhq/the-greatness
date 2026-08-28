"use client";

/**
 * The grid itself: square tiles, grouped by month with sticky headers, the
 * way a photo library reads.
 *
 * Two things are deliberate and would each be easy to do the other way:
 *
 *   - **Tiles are square and cropped** (`aspect-square` + `object-cover`).
 *     A masonry layout preserving each image's ratio is prettier for one
 *     screenshot and much harder to scan, because the eye has no grid to
 *     follow. The uncropped image is one tap away in the viewer.
 *   - **It goes edge-to-edge on a phone**, cancelling the page padding. Photos
 *     does this for a reason: at 390px, gutters either side plus a gap
 *     between columns is a tenth of the screen spent on nothing.
 *
 * Column counts step with the viewport rather than being fixed, so a 27"
 * monitor shows more photos rather than bigger ones — which is the point of
 * giving this page a wider container than the rest of the app.
 */

import { Play } from "lucide-react";
import { useState } from "react";

import { groupByMonth, monthLabel } from "@/lib/domain/products/media-grouping";
import type { MediaItem } from "@/lib/domain/products/media-repository";

import { GalleryViewer } from "./gallery-viewer";

const durationLabel = (ms: number): string => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function GalleryGrid({
  items,
}: {
  readonly items: readonly MediaItem[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  // Each item arrives with its position in the flat page, so the viewer's
  // "next" crosses month boundaries — see `groupByMonth`.
  const groups = groupByMonth(items);

  return (
    <>
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.key}>
            <h2 className="sticky top-14 z-10 -mx-1 bg-background/95 px-1 py-2 text-sm font-medium text-muted-foreground backdrop-blur">
              {monthLabel(group.key)}
              <span className="ml-2 tabular-nums text-muted-foreground/60">
                {group.items.length}
              </span>
            </h2>

            {/* Named so it is distinguishable from the sidebar's menu, which
                is also a list of list-items. */}
            {/* `-mx-4` cancels the page padding below `sm`: Photos is
                edge-to-edge for a reason — at 390px a 16px gutter either side
                is 8% of the screen spent on nothing. A deliberate full-bleed,
                and the only negative margin in the app. */}
            <ul
              aria-label={`Media added in ${monthLabel(group.key)}`}
              className="-mx-4 grid grid-cols-3 gap-0.5 sm:mx-0 sm:grid-cols-4 sm:gap-1 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10"
            >
              {group.items.map(({ item, index }) => {
                const { attachment, product } = item;
                return (
                  <li key={attachment.id}>
                    <button
                      type="button"
                      onClick={() => setOpenIndex(index)}
                      className="group relative block aspect-square w-full overflow-hidden bg-muted focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:rounded-sm"
                    >
                      {/* A plain <img>: these are operator uploads served
                          from our own origin or Blob, already at the size the
                          media library produced. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-full object-cover transition-transform duration-200 ease-out motion-safe:group-hover:scale-105"
                      />

                      {attachment.kind === "video" && (
                        <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                          <Play className="size-2.5 fill-current" aria-hidden />
                          {attachment.durationMs
                            ? durationLabel(attachment.durationMs)
                            : "Video"}
                        </span>
                      )}

                      {/* The product name on hover — enough to know what you
                          are looking at without opening it. Hidden on touch,
                          where there is no hover and a tap opens the viewer
                          anyway. */}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6 text-left text-[11px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100 md:block">
                        <span className="line-clamp-2">{product.name}</span>
                      </span>

                      {/* The accessible name. The visual label is decorative
                          and hover-only; this is what a screen reader reads. */}
                      <span className="sr-only">
                        {attachment.alt ??
                          `${attachment.kind} for ${product.name}`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <GalleryViewer
        items={items}
        index={openIndex}
        onIndexChange={setOpenIndex}
        onClose={() => setOpenIndex(null)}
      />
    </>
  );
}

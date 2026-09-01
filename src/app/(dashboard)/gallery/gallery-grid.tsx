"use client";

/**
 * The library grid: square tiles, grouped by month with sticky headers, the
 * way a photo library reads.
 *
 * Three things are deliberate and would each be easy to do the other way:
 *
 *   - **Tiles are square and cropped** (`aspect-square` + `object-cover`).
 *     A masonry layout preserving each ratio is prettier for one screenshot
 *     and much harder to scan, because the eye has no grid to follow. The
 *     uncropped image is one tap away.
 *   - **It goes edge-to-edge on a phone**, cancelling the page padding. Photos
 *     does this for a reason: at 390px, gutters either side plus a gap between
 *     columns is a tenth of the screen spent on nothing.
 *   - **Selecting is a mode, not a hover affordance.** A checkbox that only
 *     appears on hover does not exist on a touch screen, and this is the
 *     surface where the destructive action lives.
 */

import { Check, Play } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { groupByMonth, monthLabel } from "@/lib/domain/media/grouping";
import type { LibraryItem } from "@/lib/domain/media/repository";
import { cn } from "@/lib/utils";

import { GalleryViewer } from "./gallery-viewer";

const durationLabel = (ms: number): string => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function GalleryGrid({
  items,
  selecting = false,
  selected = new Set<string>(),
  onToggle,
}: {
  readonly items: readonly LibraryItem[];
  readonly selecting?: boolean;
  readonly selected?: ReadonlySet<string>;
  readonly onToggle?: (id: string) => void;
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

            {/* `-mx-4` cancels the page padding below `sm` — a deliberate
                full-bleed, and the only negative margin in the app. */}
            <ul
              aria-label={`Media added in ${monthLabel(group.key)}`}
              className="-mx-4 grid grid-cols-3 gap-0.5 sm:mx-0 sm:grid-cols-4 sm:gap-1 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10"
            >
              {group.items.map(({ item, index }) => {
                const { asset, usedBy } = item;
                const isSelected = selected.has(asset.id);
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() =>
                        selecting ? onToggle?.(asset.id) : setOpenIndex(index)
                      }
                      aria-pressed={selecting ? isSelected : undefined}
                      className={cn(
                        // The inset ring is not decoration. Almost every product photograph in
                        // this catalogue is shot on white, and against a near-white
                        // `bg-muted` in light theme the tile had no edge at all — the
                        // grid dissolved into the page. Dark theme hid the problem.
                        "group relative block aspect-square w-full overflow-hidden bg-muted ring-1 ring-border/70 ring-inset focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:rounded-sm",
                        isSelected && "ring-2 ring-primary",
                      )}
                    >
                      {/* The grid is the heaviest page in the app — 60 tiles.
                          Sized per breakpoint so the optimizer serves a tile,
                          not the archive it was derived from. */}
                      <Image
                        src={item.src}
                        alt=""
                        fill
                        sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 12vw"
                        className={cn(
                          "object-cover transition-transform duration-200 ease-out",
                          !selecting && "motion-safe:group-hover:scale-105",
                          isSelected && "scale-90",
                        )}
                      />

                      {selecting && (
                        <span
                          className={cn(
                            "absolute left-1 top-1 flex size-5 items-center justify-center rounded-full border-2 border-white/80 shadow",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-black/25",
                          )}
                        >
                          {isSelected && (
                            <Check className="size-3" aria-hidden />
                          )}
                        </span>
                      )}

                      {asset.kind === "video" && (
                        <span className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                          <Play className="size-2.5 fill-current" aria-hidden />
                          {asset.durationMs
                            ? durationLabel(asset.durationMs)
                            : "Video"}
                        </span>
                      )}

                      {/* Unattached assets are marked: "what have I uploaded
                          and not used yet" is answerable at a glance, or not
                          at all. */}
                      {usedBy.length === 0 && !selecting && (
                        <span className="absolute left-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[10px] font-medium text-white">
                          Unused
                        </span>
                      )}

                      {/* Hover label: enough to know what you are looking at
                          without opening it. Hidden on touch, where there is
                          no hover and a tap opens the viewer anyway. */}
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 hidden bg-gradient-to-t from-black/70 to-transparent p-1.5 pt-6 text-left text-[11px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100 md:block">
                        <span className="line-clamp-2">
                          {usedBy[0]?.name ?? (asset.alt || "Not used yet")}
                        </span>
                      </span>

                      {/* The accessible name. The visual label is decorative
                          and hover-only; this is what a screen reader reads. */}
                      <span className="sr-only">
                        {asset.alt ??
                          `${asset.kind}${
                            usedBy.length > 0
                              ? ` used on ${usedBy.map((p) => p.name).join(", ")}`
                              : ", not used yet"
                          }`}
                        {selecting && isSelected ? ", selected" : ""}
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

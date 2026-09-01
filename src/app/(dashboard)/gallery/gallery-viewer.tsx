"use client";

/**
 * The full-screen viewer — what opens when a tile is tapped.
 *
 * Modelled on Photos, which means three things that are easy to leave out and
 * immediately missed:
 *
 *   - **Arrow keys and swipe move between items**, not just a close button.
 *     A gallery you have to close and re-open to see the next thing is a list
 *     of links with extra steps.
 *   - **The image is never cropped, and never upscaled.** `object-contain`
 *     inside the viewport, so a tall photo is shown whole rather than
 *     centre-cropped the way the grid tile deliberately is. An asset smaller
 *     than the viewport is shown at its real size: this is the one screen
 *     where an operator is checking what they actually uploaded, and
 *     stretching a 200px image to fill a monitor hides exactly the problem
 *     they came here to find.
 *   - **The caption carries the reason you are here** — which products use
 *     this asset, and a way to go to each. A viewer that shows only the
 *     picture makes you memorise it and navigate back.
 *   - **Alt text is edited here.** It describes the picture, so the place to
 *     write it is the one screen showing the picture at full size. It was
 *     previously edited on a 120px thumbnail in the product form, which is
 *     asking someone to describe something they cannot see.
 *
 * Built on shadcn's `Dialog` for the focus trap and Esc handling, with its
 * chrome removed: those are the accessibility parts that are tedious and
 * easy to get subtly wrong by hand.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MEDIA_ALT_MAX } from "@/lib/domain/media/entity";
import type { LibraryItem } from "@/lib/domain/media/repository";
import { cn } from "@/lib/utils";

import { updateMediaAlt } from "./actions";

/** Human file size, for the "4.2 MB → 310 KB" line. That comparison is the
 * only place the optimization's value is visible. */
const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/** Below this, a horizontal drag is a swipe rather than a stray touch. */
const SWIPE_THRESHOLD_PX = 50;

export function GalleryViewer({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  readonly items: readonly LibraryItem[];
  /** `null` when nothing is open. */
  readonly index: number | null;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const [, startSaving] = useTransition();
  const item = index === null ? undefined : items[index];

  // Keyed on the asset so moving to the next item resets the field rather
  // than carrying the previous one's text across.
  const [alt, setAlt] = useState("");
  const currentId = item?.asset.id;
  useEffect(() => {
    setAlt(item?.asset.alt ?? "");
    // `currentId` rather than `item`: the item object is rebuilt on every
    // parent render, which would reset the field mid-typing.
  }, [currentId, item?.asset.alt]);

  const step = useCallback(
    (delta: -1 | 1) => {
      if (index === null) return;
      const next = index + delta;
      // Deliberately not wrapping. In a library of hundreds, jumping from the
      // last item to the first reads as a glitch, not as a feature.
      if (next >= 0 && next < items.length) onIndexChange(next);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    if (index === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, step]);

  // Narrows `index` to a number for the rest of the render, which is why the
  // guard is on the item rather than on a separate `open` boolean.
  if (item === undefined || index === null) return null;

  const { asset, usedBy } = item;
  const isVideo = asset.kind === "video";
  const hasPrevious = index > 0;
  const hasNext = index < items.length - 1;

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {/* The content carries the black too, not just the overlay. At 95%
            the grid read through it as a rendering fault rather than as a
            scrim — a photo viewer wants the page gone, not dimmed. */}
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col bg-black outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            const start = touchStartX.current;
            const end = e.changedTouches[0]?.clientX;
            touchStartX.current = null;
            if (start === null || end === undefined) return;
            const dx = end - start;
            if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
            step(dx > 0 ? -1 : 1);
          }}
        >
          {/* Radix requires both for the dialog to be announced; neither
              belongs on screen over a photograph. */}
          <DialogPrimitive.Title className="sr-only">
            {asset.alt ?? "Library item"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Item {index + 1} of {items.length}. Use the left and right arrow
            keys to move between items, or Escape to close.
          </DialogPrimitive.Description>

          <div className="flex items-center justify-between gap-2 p-3 text-white/90">
            <span className="text-sm tabular-nums" aria-live="polite">
              {index + 1} / {items.length}
            </span>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X className="size-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {isVideo ? (
              // The origin, not the poster: this is the one place the actual
              // video is meant to play.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                key={asset.id}
                src={asset.originUrl}
                controls
                playsInline
                className="max-h-full max-w-full"
              />
            ) : (
              // The lightbox is where detail matters most, and `mediaSrc` is
              // now the archive — up to 1.76 MB here. Sized to the viewport
              // rather than served raw: on the largest asset that is 133 KB
              // at its full 2362px, against 1.76 MB for the file itself.
              <Image
                key={asset.id}
                src={item.src}
                alt={asset.alt ?? ""}
                fill
                sizes="100vw"
                priority
                className="object-contain"
              />
            )}

            {[
              {
                dir: -1 as const,
                enabled: hasPrevious,
                Icon: ChevronLeft,
                side: "left-2",
                label: "Previous",
              },
              {
                dir: 1 as const,
                enabled: hasNext,
                Icon: ChevronRight,
                side: "right-2",
                label: "Next",
              },
            ].map(({ dir, enabled, Icon, side, label }) => (
              <Button
                key={label}
                variant="ghost"
                size="icon"
                onClick={() => step(dir)}
                disabled={!enabled}
                aria-label={label}
                className={cn(
                  "absolute top-1/2 size-11 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white disabled:opacity-0",
                  side,
                )}
              >
                <Icon className="size-6" />
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm text-white/80">
            {/* Where this asset is used. In a library, that is the question
                the viewer exists to answer — an asset with no answer is one
                you can delete without checking anything. */}
            {usedBy.length === 0 ? (
              <Badge variant="secondary">Not used yet</Badge>
            ) : (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-white/50">Used on</span>
                {usedBy.map((product) => (
                  <Link
                    key={product.id}
                    href={`/products/${product.id}`}
                    className="font-medium text-white hover:underline"
                  >
                    {product.name}
                  </Link>
                ))}
              </span>
            )}

            <span className="text-white/50">
              {asset.width && asset.height
                ? `${asset.width}×${asset.height} · `
                : ""}
              {formatBytes(asset.bytes)}
              {asset.optimizedBytes !== null &&
                ` → ${formatBytes(asset.optimizedBytes)}`}
            </span>

            {/* Saved on blur, not on every keystroke: a server round-trip per
                character is a lot of writes for a sentence, and the field is
                small enough that leaving it is an unambiguous "done". */}
            <Input
              aria-label="Alt text"
              value={alt}
              maxLength={MEDIA_ALT_MAX}
              onChange={(e) => setAlt(e.target.value)}
              onBlur={() => {
                if (alt === (asset.alt ?? "")) return;
                startSaving(async () => {
                  await updateMediaAlt(asset.id, alt);
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                // Otherwise the viewer's arrow-key navigation fires while
                // someone is moving the caret through their own sentence.
                e.stopPropagation();
              }}
              placeholder="Describe this image"
              className="h-8 min-w-48 flex-1 border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />

            <a
              href={asset.originUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-white/70 hover:text-white"
            >
              Original <ExternalLink className="size-3.5" />
            </a>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

"use client";

/**
 * The framed batch as a grid, with two things a tile can do: open at full
 * size, and download the PNG.
 *
 * The viewer borrows the gallery's shape (black, `object-contain`, Esc and
 * arrows, a Radix `Dialog` for the focus trap) but none of its editing —
 * these are outputs of a script, not library assets. Download is a plain
 * `<a download>` to the same route the grid reads from; same-origin, so the
 * browser honours the attribute and saves the file under its SKU name.
 */

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Framed = { readonly file: string; readonly v: string };

// `v` is the file's version (see framed.ts): a regenerated batch under the
// same names must be new URLs, or next/image serves the old frames.
const hrefFor = (f: Framed) =>
  `/brand/thumbnails/${encodeURIComponent(f.file)}?v=${f.v}`;
const skuOf = (f: Framed) => f.file.replace(/\.png$/i, "");

export function ThumbnailGrid({
  files,
}: {
  readonly files: readonly Framed[];
}) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {files.map((file, index) => {
          const sku = skuOf(file);
          return (
            <li key={file.file} className="group flex flex-col gap-2">
              <div className="relative overflow-hidden rounded-md bg-white">
                <Image
                  src={hrefFor(file)}
                  alt={sku}
                  width={400}
                  height={400}
                  sizes="(min-width: 1024px) 200px, (min-width: 640px) 33vw, 50vw"
                  className="aspect-square w-full object-contain"
                />
                {/* Always reachable by keyboard; revealed on hover for the
                    pointer, so 129 tiles do not each carry two visible
                    buttons. */}
                <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-linear-to-t from-black/50 to-transparent p-2 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label={`View ${sku} full screen`}
                    onClick={() => setOpen(index)}
                  >
                    <Maximize2 />
                  </Button>
                  <Button variant="secondary" size="icon-sm" asChild>
                    <a
                      href={hrefFor(file)}
                      download={file.file}
                      aria-label={`Download ${sku}`}
                    >
                      <Download />
                    </a>
                  </Button>
                </div>
              </div>
              <div
                className="truncate text-xs text-muted-foreground"
                title={sku}
              >
                {sku}
              </div>
            </li>
          );
        })}
      </ul>
      {open !== null ? (
        <Viewer
          files={files}
          index={open}
          onStep={setOpen}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function Viewer({
  files,
  index,
  onStep,
  onClose,
}: {
  readonly files: readonly Framed[];
  readonly index: number;
  readonly onStep: (index: number) => void;
  readonly onClose: () => void;
}) {
  const file = files[index] ?? { file: "", v: "0" };
  const sku = skuOf(file);
  const hasPrevious = index > 0;
  const hasNext = index < files.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrevious) onStep(index - 1);
      if (e.key === "ArrowRight" && hasNext) onStep(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrevious, hasNext, onStep]);

  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col bg-black outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0">
          <DialogPrimitive.Title className="sr-only">
            {sku}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Thumbnail {index + 1} of {files.length}. Use the left and right
            arrow keys to move between photos, or Escape to close.
          </DialogPrimitive.Description>

          <div className="flex items-center justify-between gap-2 p-3 text-white/90">
            <span className="flex gap-3 text-sm" aria-live="polite">
              <span className="tabular-nums">
                {index + 1} / {files.length}
              </span>
              <span>{sku}</span>
            </span>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <a
                  href={hrefFor(file)}
                  download={file.file}
                  aria-label={`Download ${sku}`}
                >
                  <Download className="size-5" />
                </a>
              </Button>
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
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
            {/* Unoptimized on purpose: this is where the 800 px PNG is
                checked pixel for pixel, so it is served as written. */}
            <Image
              key={file.file}
              src={hrefFor(file)}
              alt={sku}
              width={800}
              height={800}
              unoptimized
              priority
              className="max-h-full max-w-full object-contain"
            />
            {[
              {
                dir: -1,
                enabled: hasPrevious,
                Icon: ChevronLeft,
                side: "left-2",
                label: "Previous",
              },
              {
                dir: 1,
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
                className={`absolute top-1/2 ${side} -translate-y-1/2 text-white hover:bg-white/10 hover:text-white disabled:opacity-20`}
                aria-label={label}
                disabled={!enabled}
                onClick={() => onStep(index + dir)}
              >
                <Icon className="size-6" />
              </Button>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

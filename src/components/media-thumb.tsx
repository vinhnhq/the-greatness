"use client";

/**
 * An asset rendered at the size it is actually displayed.
 *
 * **Why this exists rather than an `<img>` at four call sites.** The library
 * stores the de-logoed original — see `mediaSrc` — and the whole point of
 * serving that instead of a 1600px variant is that `next/image` derives a
 * per-breakpoint copy at request time. An `<img>`, or an `<Image>` with
 * `unoptimized`, hands the browser the full archive: on the largest asset
 * here that is 1.76 MB into a 40px box.
 *
 * So the rule is "every persisted asset renders through this", and the rule
 * lives in one file because four call sites is four chances to paste
 * `unoptimized` back in. Measured, same asset: `w=48` → 1.2 KB, `w=256` →
 * 8.7 KB, `w=2048` → 133 KB at full 2362px detail.
 *
 * `sizes` is required and has no default on purpose. It is the one thing the
 * component cannot infer, a wrong value silently ships the wrong bytes, and a
 * default would be wrong at three of the four call sites.
 */

import Image from "next/image";

import type { MediaAsset } from "@/lib/domain/media/entity";
import { mediaSrc } from "@/lib/domain/media/entity";
import { cn } from "@/lib/utils";

export function MediaThumb({
  asset,
  sizes,
  className,
  priority = false,
}: {
  readonly asset: MediaAsset;
  /** What the browser should assume this renders at, per breakpoint. */
  readonly sizes: string;
  readonly className?: string;
  readonly priority?: boolean;
}) {
  return (
    <Image
      src={mediaSrc(asset)}
      alt={asset.alt ?? ""}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
    />
  );
}

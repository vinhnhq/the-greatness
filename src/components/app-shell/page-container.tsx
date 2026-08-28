/**
 * The centered column every page sits in.
 *
 * Two reasons it is a component each page renders, rather than a wrapper
 * baked into the shell's `<main>`:
 *
 *   1. **Pages disagree about width, legitimately.** A table wants a reading
 *      width — on a 27" monitor an unbounded row makes the eye travel from a
 *      product name on the far left to a price on the far right. A photo grid
 *      wants the opposite: more screen means more columns, which is the whole
 *      point of a gallery.
 *   2. Baking a single width into the shell means the page that needs another
 *      one escapes with negative margins, and negative-margin escapes are how
 *      a layout stops being predictable.
 *
 * Mobile is the same component with no max-width in play: `w-full` plus
 * padding that steps up at `sm`, so a 390px phone gets edge-to-edge content
 * with a 16px gutter and nothing is cut off.
 */

import { cn } from "@/lib/utils";

const WIDTHS = {
  /** Tables, forms, reading. 1280px — past that a row is hard to track. */
  default: "max-w-7xl",
  /** The gallery. 1920px, because a wider screen should mean more photos. */
  wide: "max-w-[120rem]",
  /** A single form column, when there is nothing to put beside it. */
  narrow: "max-w-3xl",
} as const;

export function PageContainer({
  width = "default",
  className,
  children,
}: {
  readonly width?: keyof typeof WIDTHS;
  readonly className?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div
      // A hook for the E2E assertion that content stays centred rather than
      // stretching on a wide monitor. That check has to work on a page with
      // no rows in it, so it cannot key off a table.
      data-page-container={width}
      className={cn(
        "mx-auto flex w-full flex-1 flex-col gap-4",
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}

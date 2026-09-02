"use client";

/**
 * One element, two behaviours: the grid's second column on a wide screen, an
 * off-canvas drawer below `lg`.
 *
 * **Not two components.** Rendering the pane and a `Sheet` side by side would
 * put the quick-edit form in the DOM twice — two sets of inputs holding two
 * copies of the same state, and duplicate ids for every label. Switching on a
 * media query in JS trades that for a hydration mismatch. So this is a single
 * node whose positioning changes at the breakpoint, and the content inside it
 * is mounted exactly once.
 *
 * The scrim only exists below `lg`, and only while something is selected —
 * on a wide screen there is nothing to dismiss, because the pane is simply
 * part of the layout.
 */

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DetailPane({
  open,
  onClose,
  children,
}: {
  /** Whether a product or category is selected. Ignored at `lg` and above. */
  readonly open: boolean;
  readonly onClose: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close detail"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
        />
      )}

      <aside
        aria-label="Detail"
        // `inert` rather than `hidden`: off-canvas content is still in the
        // DOM, and without this a closed drawer's inputs stay tabbable.
        inert={open ? undefined : true}
        className={cn(
          "min-w-0",
          // Below lg: a drawer.
          "fixed inset-y-0 right-0 z-50 w-[min(28rem,100%)] overflow-y-auto border-l bg-background p-4 pt-12 shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
          // At lg: just the second column again.
          "lg:static lg:z-auto lg:w-auto lg:translate-x-0 lg:overflow-visible lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none",
        )}
      >
        {/* The drawer owns its own dismissal. The pane at `lg` is part of the
            layout and has nothing to dismiss, so this is not rendered there —
            and the content, which the server renders, never has to carry a
            client callback for it. */}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="absolute top-2 right-2 size-8 lg:hidden"
          onClick={onClose}
          aria-label="Close detail"
        >
          <X className="size-4" aria-hidden />
        </Button>

        {children}
      </aside>
    </>
  );
}

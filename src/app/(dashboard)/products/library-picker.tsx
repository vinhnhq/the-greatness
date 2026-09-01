"use client";

/**
 * "Add from library" — the gallery grid in a dialog, multi-select.
 *
 * It loads on open rather than with the page. A product form that fetched the
 * whole library up front would pay for it on every edit, including the many
 * where nobody opens this at all.
 *
 * Assets already on the product are **excluded rather than shown as
 * disabled**: a grid of greyed-out tiles is mostly noise, and the ones that
 * are already attached are visible in the field behind the dialog.
 */

import { Check, Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { MediaThumb } from "@/components/media-thumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { MediaAsset } from "@/lib/domain/media/entity";
import { cn } from "@/lib/utils";

import { listLibraryForPicker } from "./actions";

export function LibraryPicker({
  open,
  onOpenChange,
  excludeIds,
  remaining,
  onConfirm,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Already attached to this product. */
  readonly excludeIds: readonly string[];
  /** How many more this product can take, so the dialog can stop rather than
   * letting someone pick twelve and silently keep four. */
  readonly remaining: number;
  readonly onConfirm: (assets: readonly MediaAsset[]) => void;
}) {
  const [assets, setAssets] = useState<readonly MediaAsset[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Load on open, and reset on close so re-opening never shows a stale
  // library or a selection someone already applied.
  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      return;
    }
    let cancelled = false;
    setAssets(null);
    setError(null);
    listLibraryForPicker()
      .then((rows) => {
        if (!cancelled) setAssets(rows as readonly MediaAsset[]);
      })
      .catch(() => {
        if (!cancelled) setError("The library could not be loaded.");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const excluded = new Set(excludeIds);
  const available = (assets ?? []).filter((a) => !excluded.has(a.id));
  const atLimit = selected.size >= remaining;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else if (next.size < remaining) next.add(id);
      return next;
    });

  const confirm = () => {
    onConfirm(available.filter((a) => selected.has(a.id)));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `flex flex-col` is load-bearing: without it the grid's `flex-1`
          means nothing, the scroll region takes its full height, and the
          footer with Cancel and Add is pushed below the fold — a dialog you
          can look at but not confirm. */}
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 overflow-hidden sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add from library</DialogTitle>
          <DialogDescription>
            {remaining === 1
              ? "Room for one more file on this product."
              : `Room for ${remaining} more files on this product.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {assets === null && !error && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Loading the library…
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="py-12 text-center text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {assets !== null && available.length === 0 && (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nothing left to add</EmptyTitle>
                <EmptyDescription>
                  {assets.length === 0
                    ? "The library is empty — upload a file below, or from the Gallery."
                    : "Every file in the library is already on this product."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {available.length > 0 && (
            <ul
              aria-label="Library"
              className="grid grid-cols-3 gap-1 sm:grid-cols-4 md:grid-cols-6"
            >
              {available.map((asset) => {
                const isSelected = selected.has(asset.id);
                // Only the unselected ones lock at the limit; a selected tile
                // must always be un-selectable or the limit becomes a trap.
                const locked = atLimit && !isSelected;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => toggle(asset.id)}
                      disabled={locked}
                      aria-pressed={isSelected}
                      className={cn(
                        "relative block aspect-square w-full overflow-hidden rounded-sm bg-muted ring-1 ring-border/70 ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        isSelected && "ring-2 ring-primary",
                        locked && "cursor-not-allowed opacity-40",
                      )}
                    >
                      <MediaThumb
                        asset={asset}
                        sizes="(max-width: 640px) 33vw, 160px"
                      />
                      <span
                        className={cn(
                          "absolute left-1 top-1 flex size-5 items-center justify-center rounded-full border-2 border-white/80",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-black/25",
                        )}
                      >
                        {isSelected && <Check className="size-3" aria-hidden />}
                      </span>
                      <span className="sr-only">
                        {asset.alt ?? asset.kind}
                        {isSelected ? ", selected" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="shrink-0 items-center gap-2 sm:justify-between">
          <span className="text-sm text-muted-foreground" aria-live="polite">
            {selected.size} selected
            {atLimit && selected.size > 0 && " — that is the limit"}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={selected.size === 0}
            >
              <Search className="size-4" aria-hidden />
              Add {selected.size > 0 ? selected.size : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

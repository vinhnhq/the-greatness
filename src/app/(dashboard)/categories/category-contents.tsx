"use client";

/**
 * The right pane: the products in the selected category, each draggable onto
 * a category in the tree.
 *
 * A client component so the rows can be drag sources, but it holds no data of
 * its own — the server fetches and passes it down, which keeps the repository
 * out of the browser bundle.
 */

import { useDraggable } from "@dnd-kit/core";
import { FolderTree } from "lucide-react";

import { MediaThumb } from "@/components/media-thumb";
import { SapoLink } from "@/components/sapo-link";
import type { MediaAsset } from "@/lib/domain/media/entity";
import { cn } from "@/lib/utils";

export type ContentRow = {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly image: MediaAsset | null;
};

function ProductRow({ row }: { readonly row: ContentRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `product:${row.id}`,
    data: { kind: "product", id: row.id, name: row.name },
  });

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "flex cursor-grab touch-none items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted/50",
        isDragging && "opacity-40",
      )}
    >
      <span className="relative size-9 shrink-0 overflow-hidden rounded-md border bg-muted">
        {row.image && <MediaThumb asset={row.image} sizes="36px" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{row.name}</span>
        {row.sku !== null && (
          <span className="block truncate font-mono text-xs text-muted-foreground">
            {row.sku}
          </span>
        )}
      </span>
    </li>
  );
}

export function CategoryContents({
  title,
  path,
  slug,
  sapoUrl,
  rows,
}: {
  readonly title: string | null;
  /** Ancestors, outermost first. Empty for a root. */
  readonly path?: readonly string[];
  readonly slug?: string;
  readonly sapoUrl?: string | null;
  readonly rows: readonly ContentRow[];
}) {
  if (title === null) {
    return (
      <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
        <FolderTree className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Pick a category to see what is in it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {/* The path first, quietly: "Quạt đứng" is one of nine near-identical
            fan names, and its ancestors are what tell them apart. */}
        {path !== undefined && path.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {path.join(" › ")}
          </p>
        )}
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {slug !== undefined && <code>/{slug}</code>}
          <span>
            {rows.length} product{rows.length === 1 ? "" : "s"} filed here
            directly
          </span>
          {/* Renders nothing for a category created here. */}
          <SapoLink url={sapoUrl ?? null} label="Sapo" />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nothing is filed here directly. Drag a product onto a category to file
          it.
        </p>
      ) : (
        <ul aria-label="Products in this category" className="flex flex-col">
          {rows.map((row) => (
            <ProductRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

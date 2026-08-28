"use client";

/**
 * The kind tabs and the product filter, both writing to the URL.
 *
 * The counts on the tabs are not decoration: "Videos" with nothing behind it
 * is a control that punishes pressing it, and the only way to know is to
 * press it. With `Videos 3` the tab answers the question itself.
 *
 * The product filter lists only products that **have** media — offering the
 * twenty-seven that would return an empty grid is offering twenty-seven ways
 * to be disappointed.
 */

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_MEDIA_QUERY,
  galleryHref,
  type MediaFilter,
  type MediaQuery,
  withMediaQuery,
} from "@/lib/domain/media/query";
import type { ProductId } from "@/lib/domain/products/entity";
import { cn } from "@/lib/utils";

const TABS: readonly { readonly value: MediaFilter; readonly label: string }[] =
  [
    { value: "all", label: "All" },
    { value: "image", label: "Photos" },
    { value: "video", label: "Videos" },
  ];

export function GalleryToolbar({
  query,
  counts,
  products,
}: {
  readonly query: MediaQuery;
  readonly counts: {
    readonly all: number;
    readonly image: number;
    readonly video: number;
    readonly unused: number;
  };
  readonly products: readonly {
    readonly id: ProductId;
    readonly name: string;
  }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const go = (patch: Partial<MediaQuery>) => {
    startTransition(() =>
      router.push(galleryHref(withMediaQuery(query, patch))),
    );
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-pending={pending || undefined}
    >
      {/* A segmented control rather than a Select: three options that are
          switched between constantly should not cost a menu each time. */}
      <div
        className="inline-flex items-center gap-1 rounded-full bg-muted p-1"
        role="group"
        aria-label="Filter by kind"
      >
        {TABS.map((tab) => {
          const active = query.kind === tab.value;
          return (
            <Button
              key={tab.value}
              type="button"
              size="sm"
              // Filled vs. plain, never hover-dependent: this is a mobile
              // surface too, and hover cannot be what says which is active.
              variant={active ? "default" : "ghost"}
              aria-pressed={active}
              onClick={() => go({ kind: tab.value })}
              className={cn("rounded-full", !active && "hover:bg-background")}
            >
              {tab.label}
              <span className="tabular-nums opacity-60">
                {tab.value === "all"
                  ? counts.all
                  : tab.value === "image"
                    ? counts.image
                    : counts.video}
              </span>
            </Button>
          );
        })}
      </div>

      {/* "What have I uploaded and not used yet" is the question a library
          gets asked most, and it is unanswerable from the kind tabs alone. */}
      <Button
        type="button"
        size="sm"
        variant={query.unusedOnly ? "default" : "outline"}
        aria-pressed={query.unusedOnly}
        onClick={() => go({ unusedOnly: !query.unusedOnly })}
      >
        Unused
        <span className="tabular-nums opacity-60">{counts.unused}</span>
      </Button>

      {products.length > 0 && (
        <Select
          value={query.productId ?? "all"}
          onValueChange={(value) =>
            go({ productId: value === "all" ? null : (value as ProductId) })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-52"
            aria-label="Filter by product"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All products</SelectItem>
            {products.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {(query.kind !== "all" ||
        query.productId !== null ||
        query.unusedOnly) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            startTransition(() => router.push(galleryHref(DEFAULT_MEDIA_QUERY)))
          }
        >
          <X className="size-4" /> Reset
        </Button>
      )}
    </div>
  );
}

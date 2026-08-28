/**
 * The product list itself — a real `<table>`, rendered on the server.
 *
 * A grid of `<div>`s would have been easier to style and would have cost
 * every screen-reader user the ability to navigate it by column. The
 * thumbnail cell is `aria-hidden` because the product name in the next cell
 * already names the row; announcing both means hearing everything twice.
 *
 * **On a phone, secondary columns are hidden rather than scrolled to.** Six
 * columns in a 390px viewport means a horizontal scrollbar under every row,
 * and a horizontal scrollbar inside a vertically-scrolling page is a fight.
 * Name, status and price stay; categories and the update date move into the
 * name cell as a second line, where they are still readable and still there.
 */

import { ImageOff, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Category } from "@/lib/domain/categories/entity";
import { mediaSrc, primaryImageOf } from "@/lib/domain/media/entity";
import type { ProductStatus } from "@/lib/domain/products/entity";
import type { ProductListRow } from "@/lib/domain/products/repository";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Status as a colour plus a word, never a colour alone — the difference
 * between draft and active has to survive being printed in greyscale or read
 * by someone who cannot distinguish the two hues.
 */
const STATUS_CLASS: Record<ProductStatus, string> = {
  active: "border-transparent bg-success/15 text-success",
  draft: "border-transparent bg-warning/15 text-warning",
  archived: "border-transparent bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { readonly status: ProductStatus }) {
  return (
    <Badge className={cn("capitalize", STATUS_CLASS[status])}>{status}</Badge>
  );
}

function Thumbnail({ product }: { readonly product: ProductListRow }) {
  const image = primaryImageOf(product.media);
  const video = product.media.find((a) => a.kind === "video");

  // A fixed-size wrapper, always — including around the image.
  //
  // An `<img>` cannot hold this column open on its own: Tailwind's preflight
  // caps images at `max-width: 100%`, so next to a `w-full` neighbour the
  // image sizes to the cell while the cell sizes to the image, and the pair
  // settles at a 4px strip. A `div` with an explicit width has no such cycle.
  return (
    <div className="size-10 overflow-hidden rounded-md border bg-muted">
      {image ? (
        <Image
          src={mediaSrc(image)}
          alt=""
          width={40}
          height={40}
          className="size-full object-cover"
          // Unoptimized keeps the local driver's files serving straight from
          // disk rather than through the image optimizer, which cannot reach
          // a relative path during a build.
          unoptimized
        />
      ) : (
        <div className="flex size-full items-center justify-center text-muted-foreground">
          {video ? (
            <Play className="size-4" aria-hidden />
          ) : (
            <ImageOff className="size-4" aria-hidden />
          )}
        </div>
      )}
    </div>
  );
}

export function ProductsTable({
  products,
  categories,
}: {
  readonly products: readonly ProductListRow[];
  readonly categories: readonly Category[];
}) {
  const categoryName = new Map(categories.map((c) => [c.id as string, c.name]));

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-px pr-0">
              <span className="sr-only">Image</span>
            </TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="w-px">Status</TableHead>
            <TableHead className="hidden lg:table-cell">Categories</TableHead>
            <TableHead className="whitespace-nowrap text-right">
              Price
            </TableHead>
            <TableHead className="hidden text-right md:table-cell">
              Updated
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              {/* The width is repeated on the cell, not just the header:
                  `w-full` on the name cell claims space from every neighbour
                  that has not pinned its own, which collapsed this to a 4px
                  strip of image. */}
              <TableCell aria-hidden className="w-px pr-0">
                <Thumbnail product={product} />
              </TableCell>

              {/* `w-full` claims the leftover width and `max-w-0` lets the
                  content truncate inside it — the pair is what stops a table
                  splitting space evenly and rendering "Ceramic..." next to a
                  half-empty price column. */}
              <TableCell className="w-full max-w-0">
                <Link
                  href={`/products/${product.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {product.name}
                </Link>
                <div className="truncate text-xs text-muted-foreground">
                  {product.sku ?? "No SKU"}
                  {/* The categories column is hidden below `lg`; rather than
                      losing the information, it folds in here. */}
                  <span className="lg:hidden">
                    {product.categoryIds.length > 0 &&
                      ` · ${product.categoryIds
                        .map((id) => categoryName.get(id) ?? "Unknown")
                        .join(", ")}`}
                  </span>
                </div>
              </TableCell>

              <TableCell className="w-px">
                <StatusBadge status={product.status} />
              </TableCell>

              <TableCell className="hidden lg:table-cell">
                {product.categoryIds.length === 0 ? (
                  <span className="text-sm text-muted-foreground">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {product.categoryIds.map((id) => (
                      <Badge key={id} variant="secondary">
                        {categoryName.get(id) ?? "Unknown"}
                      </Badge>
                    ))}
                  </div>
                )}
              </TableCell>

              <TableCell className="w-px whitespace-nowrap text-right tabular-nums">
                {formatMoney({
                  minor: product.priceMinor,
                  currency: product.currency,
                })}
              </TableCell>

              <TableCell className="hidden text-right text-sm text-muted-foreground md:table-cell">
                <time dateTime={product.updatedAt.toISOString()}>
                  {product.updatedAt.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

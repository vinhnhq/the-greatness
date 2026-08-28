/**
 * The product list itself — a real `<table>`, rendered on the server.
 *
 * A grid of `<div>`s would have been easier to style and would have cost
 * every screen-reader user the ability to navigate it by column. The
 * thumbnail cell is `aria-hidden` because the product name in the next cell
 * already names the row; announcing both means hearing everything twice.
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
import {
  displayUrl,
  type ProductStatus,
  primaryImage,
} from "@/lib/domain/products/entity";
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
  const image = primaryImage(product.attachments);
  const video = product.attachments.find((a) => a.kind === "video");

  if (image) {
    return (
      <Image
        src={displayUrl(image)}
        alt=""
        width={40}
        height={40}
        className="size-10 rounded-md border object-cover"
        // The list shows at most 25 of these and they are above the fold on a
        // tall screen; unoptimized keeps the local driver's files serving
        // straight from disk rather than through the image optimizer, which
        // cannot reach a relative path during a build.
        unoptimized
      />
    );
  }

  return (
    <div className="flex size-10 items-center justify-center rounded-md border bg-muted text-muted-foreground">
      {video ? (
        <Play className="size-4" aria-hidden />
      ) : (
        <ImageOff className="size-4" aria-hidden />
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
            <TableHead className="w-14">
              <span className="sr-only">Image</span>
            </TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell aria-hidden>
                <Thumbnail product={product} />
              </TableCell>

              <TableCell>
                <Link
                  href={`/products/${product.id}`}
                  className="font-medium hover:underline"
                >
                  {product.name}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {product.sku ?? "No SKU"}
                </div>
              </TableCell>

              <TableCell>
                <StatusBadge status={product.status} />
              </TableCell>

              <TableCell>
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

              <TableCell className="text-right tabular-nums">
                {formatMoney({
                  minor: product.priceMinor,
                  currency: product.currency,
                })}
              </TableCell>

              <TableCell className="text-right text-sm text-muted-foreground">
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

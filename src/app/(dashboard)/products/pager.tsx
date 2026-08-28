/**
 * Offset pagination as plain links.
 *
 * Links rather than buttons, deliberately: a page of results is a location,
 * so it should be openable in a new tab, bookmarkable, and reachable by the
 * browser's back button. A `<button onClick={router.push}>` gives up all
 * three for nothing.
 *
 * Server component — it derives everything from the query it is handed, so it
 * ships no JavaScript.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  productListHref,
  type ProductListQuery,
  withQuery,
} from "@/lib/domain/products/list-query";

export function Pager({
  query,
  pageCount,
  total,
}: {
  readonly query: ProductListQuery;
  readonly pageCount: number;
  readonly total: number;
}) {
  if (pageCount <= 1) return null;

  const hasPrevious = query.page > 1;
  const hasNext = query.page < pageCount;

  return (
    <nav
      className="flex items-center justify-between gap-2"
      aria-label="Pagination"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Page {query.page} of {pageCount}
        <span className="sr-only"> — {total} products in total</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          asChild={hasPrevious}
          disabled={!hasPrevious}
        >
          {hasPrevious ? (
            <Link
              href={productListHref(withQuery(query, { page: query.page - 1 }))}
              rel="prev"
            >
              <ChevronLeft className="size-4" /> Previous
            </Link>
          ) : (
            <span>
              <ChevronLeft className="size-4" /> Previous
            </span>
          )}
        </Button>

        <Button
          variant="outline"
          size="sm"
          asChild={hasNext}
          disabled={!hasNext}
        >
          {hasNext ? (
            <Link
              href={productListHref(withQuery(query, { page: query.page + 1 }))}
              rel="next"
            >
              Next <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span>
              Next <ChevronRight className="size-4" />
            </span>
          )}
        </Button>
      </div>
    </nav>
  );
}

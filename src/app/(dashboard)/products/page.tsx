/**
 * `/products` — the list.
 *
 * The whole query lives in `searchParams`, parsed by the pure
 * `parseProductListQuery`, so this page is a function of the URL and nothing
 * else. Filtering happens in SQL against an index rather than over rows
 * shipped to the browser, which is what lets the page size stay flat as the
 * catalogue grows.
 *
 * Empty and no-match are deliberately different states. "No products yet"
 * offers the button that fixes it; "no products match" offers the reset that
 * fixes *that*. Collapsing them into one message tells a new user their seed
 * failed and tells a searching user to create a duplicate.
 */

import { Plus, PackageOpen, SearchX } from "lucide-react";
import Link from "next/link";

import { PageContainer } from "@/components/app-shell/page-container";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import {
  DEFAULT_QUERY,
  PAGE_SIZE,
  pageCount,
  parseProductListQuery,
  productListHref,
} from "@/lib/domain/products/list-query";
import { dbProductRepo } from "@/lib/domain/products/repository";

import { Pager } from "./pager";
import { ProductsTable } from "./products-table";
import { ProductsToolbar } from "./products-toolbar";

export const metadata = { title: "Products" };

export default async function ProductsPage({
  searchParams,
}: PageProps<"/products">) {
  const query = parseProductListQuery(await searchParams);
  const [page, categories] = await Promise.all([
    dbProductRepo.list(query),
    dbCategoryRepo.list(),
  ]);

  const isFiltered =
    query.search !== "" || query.status !== "all" || query.categoryId !== null;
  const from = (query.page - 1) * PAGE_SIZE + 1;
  const to = Math.min(query.page * PAGE_SIZE, page.total);

  return (
    <PageContainer>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            {page.total === 0
              ? "Nothing to show"
              : `Showing ${from}–${to} of ${page.total}`}
          </p>
        </div>
        <Button asChild>
          <Link href="/products/new">
            <Plus className="size-4" /> New product
          </Link>
        </Button>
      </div>

      <ProductsToolbar query={query} categories={categories} />

      {page.rows.length > 0 ? (
        <>
          <ProductsTable products={page.rows} categories={categories} />
          <Pager
            query={query}
            pageCount={pageCount(page.total)}
            total={page.total}
          />
        </>
      ) : isFiltered ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No products match these filters</EmptyTitle>
            <EmptyDescription>
              Try a different search term, or clear the filters to see the whole
              catalogue.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link href={productListHref(DEFAULT_QUERY)}>Clear filters</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>No products yet</EmptyTitle>
            <EmptyDescription>
              Add your first product, or run{" "}
              <code className="font-mono text-xs">bun run db:local</code> to
              seed a sample catalogue.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/products/new">
                <Plus className="size-4" /> New product
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </PageContainer>
  );
}

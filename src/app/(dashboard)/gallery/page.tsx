/**
 * `/gallery` — every image and video in the catalogue, in one grid.
 *
 * The inverse of `/products`: that page is products that happen to have
 * media, this is media that happens to belong to a product. Same conventions
 * — the query lives in the URL, the read is one JOIN, empty and no-match are
 * distinct states — with a **wider container**, because on a gallery more
 * screen should mean more photos rather than bigger ones.
 */

import { ImageOff, Images, PackageOpen } from "lucide-react";
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
import {
  DEFAULT_MEDIA_QUERY,
  galleryHref,
  MEDIA_PAGE_SIZE,
  mediaPageCount,
  parseMediaQuery,
} from "@/lib/domain/products/media-query";
import { dbMediaRepo } from "@/lib/domain/products/media-repository";

import { GalleryGrid } from "./gallery-grid";
import { GalleryPager } from "./gallery-pager";
import { GalleryToolbar } from "./gallery-toolbar";

export const metadata = { title: "Gallery" };

export default async function GalleryPage({
  searchParams,
}: PageProps<"/gallery">) {
  const query = parseMediaQuery(await searchParams);
  const [page, products] = await Promise.all([
    dbMediaRepo.list(query),
    dbMediaRepo.productsWithMedia(),
  ]);

  const isFiltered = query.kind !== "all" || query.productId !== null;
  const from = (query.page - 1) * MEDIA_PAGE_SIZE + 1;
  const to = Math.min(query.page * MEDIA_PAGE_SIZE, page.total);

  return (
    <PageContainer width="wide">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Gallery</h1>
          <p className="text-sm text-muted-foreground">
            {page.total === 0
              ? "Nothing to show"
              : `Showing ${from}–${to} of ${page.total}`}
          </p>
        </div>
      </div>

      <GalleryToolbar query={query} counts={page.counts} products={products} />

      {page.items.length > 0 ? (
        <>
          <GalleryGrid items={page.items} />
          <GalleryPager
            query={query}
            pageCount={mediaPageCount(page.total)}
            total={page.total}
          />
        </>
      ) : isFiltered ? (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImageOff />
            </EmptyMedia>
            <EmptyTitle>Nothing matches these filters</EmptyTitle>
            <EmptyDescription>
              {query.kind === "video"
                ? "No videos have been uploaded yet."
                : "Try another kind, or clear the filters to see everything."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link href={galleryHref(DEFAULT_MEDIA_QUERY)}>Clear filters</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <Empty className="rounded-lg border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Images />
            </EmptyMedia>
            <EmptyTitle>No media yet</EmptyTitle>
            <EmptyDescription>
              Upload an image or a video on any product and it appears here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/products">
                <PackageOpen className="size-4" /> Go to products
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </PageContainer>
  );
}

/**
 * `/gallery` — the media library.
 *
 * Not "the media belonging to products": since v2 an asset exists on its own
 * and products link to it, so this page is the source of truth and the
 * product form is a view onto it. Files can be uploaded here with no product
 * in mind, and anything uploaded from a product appears here too.
 *
 * Same conventions as `/products` — the query lives in the URL, the read is
 * one query plus one for the links, empty and no-match are distinct states —
 * with a **wider container**, because on a gallery more screen should mean
 * more photos rather than bigger ones.
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
} from "@/lib/domain/media/query";
import { dbMediaRepo } from "@/lib/domain/media/repository";

import { GalleryPager } from "./gallery-pager";
import { GalleryToolbar } from "./gallery-toolbar";
import { GalleryWorkspace } from "./gallery-workspace";

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

      <GalleryWorkspace
        items={page.items}
        emptyState={
          isFiltered ? (
            <Empty className="rounded-lg border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ImageOff />
                </EmptyMedia>
                <EmptyTitle>Nothing matches these filters</EmptyTitle>
                <EmptyDescription>
                  {query.kind === "video"
                    ? "No videos have been uploaded yet."
                    : query.unusedOnly
                      ? "Every file in the library is used by a product."
                      : "Try another kind, or clear the filters to see everything."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" asChild>
                  <Link href={galleryHref(DEFAULT_MEDIA_QUERY)}>
                    Clear filters
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="rounded-lg border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Images />
                </EmptyMedia>
                <EmptyTitle>The library is empty</EmptyTitle>
                <EmptyDescription>
                  Drop files above to add them, or upload from a product —
                  either way they land here.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" asChild>
                  <Link href="/products">
                    <PackageOpen className="size-4" /> Go to products
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          )
        }
      />

      <GalleryPager
        query={query}
        pageCount={mediaPageCount(page.total)}
        total={page.total}
      />
    </PageContainer>
  );
}

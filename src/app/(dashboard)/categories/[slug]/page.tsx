/**
 * `/categories/[slug]` — one category, and the way down to its products.
 *
 * **Why this is a separate page from `/categories`.** That one is the admin
 * list: rename, delete, add. This one is for *checking* — walking root →
 * group → category → product to see whether the taxonomy is actually
 * populated. Those want different affordances, and a rename button is noise
 * while you are reading. They share a route prefix and a data model, not a
 * toolbar.
 *
 * **A product filed in a parent AND a child appears at both.** That is
 * deliberate and it is the point of the page: eight fans in this catalogue
 * are filed in all eleven fan categories, and a view that showed each product
 * only at its deepest category would hide exactly the problem someone opened
 * this page to find. Each level shows what is genuinely linked to it — which
 * is also what Sapo stores.
 *
 * Counts stay **distinct**, reusing `buildCategoryForest`: eight fans in nine
 * fan categories are eight, not seventy-two.
 */

import { ChevronRight, FolderOpen, PackageOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BreadcrumbTitle } from "@/components/app-shell/breadcrumb-title";
import { PageContainer } from "@/components/app-shell/page-container";
import { MediaThumb } from "@/components/media-thumb";
import { SapoLink } from "@/components/sapo-link";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import {
  ancestorsOf,
  buildCategoryForest,
  findNode,
} from "@/lib/domain/categories/tree";
import { primaryImageOf } from "@/lib/domain/media/entity";
import { DEFAULT_QUERY } from "@/lib/domain/products/list-query";
import { dbProductRepo } from "@/lib/domain/products/repository";
import { formatMoney } from "@/lib/money";
import { sapoCategoryUrl } from "@/lib/sapo";

export async function generateMetadata({
  params,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const category = await dbCategoryRepo.getBySlug(slug);
  return { title: category ? category.name : "Category" };
}

export default async function CategoryPage({
  params,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;

  const category = await dbCategoryRepo.getBySlug(slug);
  if (category === null) notFound();

  const [categories, links, products] = await Promise.all([
    dbCategoryRepo.listWithCounts(),
    dbCategoryRepo.listLinks(),
    // Everything filed here directly. The page is for inspection, so it shows
    // the whole set rather than paging — the largest category holds 50.
    dbProductRepo.list({
      ...DEFAULT_QUERY,
      categoryId: category.id,
      sort: "name-asc",
    }),
  ]);

  const forest = buildCategoryForest(categories, links);
  const node = findNode(forest, category.id);
  const ancestors = ancestorsOf(categories, category.id);
  const children = node?.children ?? [];

  return (
    <PageContainer>
      {/* Renders nothing; tells the shell's breadcrumb this crumb's name, or
          it prints the raw slug at the reader. */}
      <BreadcrumbTitle title={category.name} />

      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <li>
            <Link href="/categories" className="hover:text-foreground">
              Categories
            </Link>
          </li>
          {ancestors.map((a) => (
            <li key={a.id} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
              <Link
                href={`/categories/${a.slug}`}
                className="hover:text-foreground"
              >
                {a.name}
              </Link>
            </li>
          ))}
          <li className="flex items-center gap-1">
            <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            <span className="text-foreground">{category.name}</span>
          </li>
        </ol>
      </nav>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {category.name}
        </h1>
        <SapoLink url={sapoCategoryUrl(category.sapoId)} label="Sapo" />
      </div>
      <p className="-mt-2 text-sm text-muted-foreground">
        {node === null
          ? "Not in the tree."
          : children.length === 0
            ? `${node.ownCount} product${node.ownCount === 1 ? "" : "s"} in this category.`
            : `${node.ownCount} filed here directly · ${node.subtreeCount} in this group altogether · ${children.length} subcategor${children.length === 1 ? "y" : "ies"}.`}
      </p>

      {children.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Subcategories
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => (
              <li key={child.category.id}>
                <Link
                  href={`/categories/${child.category.slug}`}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
                >
                  <span className="min-w-0 truncate font-medium">
                    {child.category.name}
                  </span>
                  {/* An empty branch says so in words. Only 20 of 211
                      categories hold anything, so "0" alone would read as a
                      page that failed rather than a group nobody has filled. */}
                  {child.subtreeCount === 0 ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      empty
                    </span>
                  ) : (
                    <Badge variant="secondary" className="shrink-0">
                      {child.subtreeCount}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Products filed here
        </h2>
        {products.rows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {children.length > 0 ? <FolderOpen /> : <PackageOpen />}
              </EmptyMedia>
              <EmptyTitle>Nothing filed here directly</EmptyTitle>
              <EmptyDescription>
                {children.length > 0
                  ? "This is a grouping — look in its subcategories above."
                  : "No product carries this category yet."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col">
            {products.rows.map((product) => {
              const image = primaryImageOf(product.media);
              return (
                <li key={product.id}>
                  <Link
                    href={`/products/${product.id}`}
                    className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-muted/50"
                  >
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {image && <MediaThumb asset={image} sizes="40px" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {product.name}
                      </span>
                      {product.sku !== null && (
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          {product.sku}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatMoney({
                        minor: product.priceMinor,
                        currency: product.currency,
                      })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}

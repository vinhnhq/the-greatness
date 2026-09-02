/**
 * `/categories` — two tabs over the same 211 rows.
 *
 * **Taxonomy** is the workspace: the whole catalogue as a tree on the left,
 * and whatever is selected beside it. It is first and it is the default,
 * because filing is the job — 697 of 832 products are in no category at all.
 *
 * **Categories** is the flat CRUD list, as Sapo itself shows it. The tree
 * deliberately does not appear there as well.
 *
 * Both selections live in the URL and are mutually exclusive:
 * `?category=<slug>` fills the pane with a category, `?product=<id>` with a
 * product. The pane is rendered **here**, on the server, and handed to the
 * client workspace as a node — the same trick the tree's contents already
 * used. That keeps the repository out of the browser bundle, and a
 * `router.replace` updates the node's props without remounting the tree, so
 * the expand state survives selecting.
 *
 * `/categories/[slug]` remains the deep, shareable view of one category.
 */

import { PageContainer } from "@/components/app-shell/page-container";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import { categoryPaths } from "@/lib/domain/categories/tree";
import { primaryImageOf } from "@/lib/domain/media/entity";
import type { ProductId } from "@/lib/domain/products/entity";
import { DEFAULT_QUERY } from "@/lib/domain/products/list-query";
import { dbProductRepo } from "@/lib/domain/products/repository";
import { isId } from "@/lib/id";
import { sapoCategoryUrl } from "@/lib/sapo";

import { CategoriesTable } from "./categories-table";
import { CategoriesTabs } from "./categories-tabs";
import { CategoryContents } from "./category-contents";
import { CategoryWorkspace } from "./category-workspace";
import { ProductQuickEdit } from "./product-quick-edit";

export const metadata = { title: "Categories" };

export default async function CategoriesPage({
  searchParams,
}: PageProps<"/categories">) {
  const query = await searchParams;
  const slug = query.category;
  const productParam = query.product;
  const selectedSlug = typeof slug === "string" ? slug : null;
  // A malformed id is treated as no selection rather than a 404: the pane is
  // a side panel, and the tree behind it is still perfectly usable.
  const selectedProductId =
    typeof productParam === "string" && isId(productParam)
      ? (productParam as ProductId)
      : null;

  // The links come back whole because a subtree count has to be distinct
  // rather than summed — a product linked to a group *and* one of its
  // children is one product. See `categories/tree.ts`.
  const [categories, links, treeProducts, selected, product] =
    await Promise.all([
      dbCategoryRepo.listWithCounts(),
      dbCategoryRepo.listLinks(),
      // All 832, four columns, no media — the tree draws an icon per product
      // and this pane is what fetches a picture.
      dbProductRepo.listForTree(),
      selectedSlug === null
        ? Promise.resolve(null)
        : dbCategoryRepo.getBySlug(selectedSlug),
      selectedProductId === null
        ? Promise.resolve(null)
        : dbProductRepo.getById(selectedProductId),
    ]);

  const contents =
    selected === null
      ? { title: null, path: [], slug: undefined, sapoUrl: null, rows: [] }
      : {
          title: selected.name,
          path: categoryPaths(categories).get(selected.id) ?? [],
          slug: selected.slug,
          sapoUrl: sapoCategoryUrl(selected.sapoId),
          rows: (
            await dbProductRepo.list({
              ...DEFAULT_QUERY,
              categoryId: selected.id,
              sort: "name-asc",
            })
          ).rows.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            image: primaryImageOf(p.media),
          })),
        };

  // Rebuilt as plain values, not passed through: a Kysely row has a null
  // prototype and React refuses to serialise one to a client component.
  const paths = categoryPaths(categories);
  const byId = new Map(categories.map((c) => [c.id as string, c]));
  const detail =
    product === null ? null : (
      <ProductQuickEdit
        // Keyed so switching products remounts the form rather than leaving
        // the previous row's edits in the inputs.
        key={product.id}
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          sku: product.sku,
          description: product.description,
          priceMinor: product.priceMinor,
          currency: product.currency,
          status: product.status,
          sapoId: product.sapoId,
          image: primaryImageOf(product.media),
          mediaIds: product.media.map((m) => m.id),
          categoryIds: [...product.categoryIds],
          memberships: product.categoryIds.flatMap((id) => {
            const category = byId.get(id);
            return category === undefined
              ? []
              : [
                  {
                    id: category.id as string,
                    name: category.name,
                    path: paths.get(category.id) ?? [],
                  },
                ];
          }),
        }}
      />
    );

  return (
    <PageContainer>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          The whole catalogue as one tree. Click a product to edit it, drag a
          category onto another to move it, or a product onto a category to file
          it — every edit here is local and survives the next sync.
        </p>
      </div>

      <CategoriesTabs
        listCount={categories.length}
        taxonomy={
          <CategoryWorkspace
            categories={categories}
            links={links}
            products={treeProducts}
            // Both branches are keyed by what they show. The pane's content
            // crosses the RSC boundary into an array of siblings that React
            // validates, so an unkeyed element warns — and the key is the
            // right answer on its own terms: switching from a category to a
            // product should remount the pane, not reuse its state.
            contents={
              detail ?? (
                <CategoryContents
                  key={contents.title ?? "empty"}
                  title={contents.title}
                  path={contents.path}
                  slug={contents.slug}
                  sapoUrl={contents.sapoUrl}
                  rows={contents.rows}
                />
              )
            }
          />
        }
        list={<CategoriesTable categories={categories} links={links} />}
      />
    </PageContainer>
  );
}

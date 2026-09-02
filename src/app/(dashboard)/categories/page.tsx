/**
 * `/categories` — two tabs over the same 211 rows.
 *
 * **Taxonomy** is the split view: the tree on the left, the selected
 * category's products on the right, and drag to re-parent or to file a
 * product. It is first and it is the default, because filing is the job —
 * 697 of 832 products are in no category at all.
 *
 * **Categories** is the flat CRUD list, as Sapo itself shows it. The tree
 * deliberately does not appear there as well.
 *
 * Selection is `?category=<slug>` and the tab is `?tab=`, so a view is
 * linkable. `/categories/[slug]` remains the deep, shareable view of one
 * category.
 */

import { PageContainer } from "@/components/app-shell/page-container";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import { primaryImageOf } from "@/lib/domain/media/entity";
import { DEFAULT_QUERY } from "@/lib/domain/products/list-query";
import { dbProductRepo } from "@/lib/domain/products/repository";

import { CategoriesTable } from "./categories-table";
import { CategoriesTabs } from "./categories-tabs";
import { CategoryContents } from "./category-contents";
import { CategoryWorkspace } from "./category-workspace";

export const metadata = { title: "Categories" };

export default async function CategoriesPage({
  searchParams,
}: PageProps<"/categories">) {
  const slug = (await searchParams).category;
  const selectedSlug = typeof slug === "string" ? slug : null;

  // Two small reads. The links come back whole because a subtree count has to
  // be distinct rather than summed — a product linked to a group *and* one of
  // its children is one product. See `categories/tree.ts`.
  const [categories, links, treeProducts, selected] = await Promise.all([
    dbCategoryRepo.listWithCounts(),
    dbCategoryRepo.listLinks(),
    // All 832, four columns, no media — the tree draws an icon per product
    // and the pane on the right is what fetches a picture.
    dbProductRepo.listForTree(),
    selectedSlug === null
      ? Promise.resolve(null)
      : dbCategoryRepo.getBySlug(selectedSlug),
  ]);

  const contents =
    selected === null
      ? { title: null, rows: [] }
      : {
          title: selected.name,
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

  return (
    <PageContainer>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Grouped as the storefront groups them. Drag a category onto another to
          move it, or a product onto a category to file it — both are local and
          survive the next sync.
        </p>
      </div>

      <CategoriesTabs
        listCount={categories.length}
        taxonomy={
          <CategoryWorkspace
            categories={categories}
            links={links}
            products={treeProducts}
            contents={
              <CategoryContents title={contents.title} rows={contents.rows} />
            }
          />
        }
        list={<CategoriesTable categories={categories} links={links} />}
      />
    </PageContainer>
  );
}

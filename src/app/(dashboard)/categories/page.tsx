/**
 * `/categories` — the workspace, and the list.
 *
 * Two things on one page, deliberately in this order. The **workspace** is the
 * split view: the tree on the left, the selected category's products on the
 * right, and drag to re-parent or to file a product. That is where the time
 * goes. The **list** below it is the CRUD surface — add, rename, delete —
 * which is occasional and does not want to compete for the top of the page.
 *
 * Selection is `?category=<slug>`, so a branch stays linkable.
 * `/categories/[slug]` remains the deep, shareable view of one category.
 */

import { PageContainer } from "@/components/app-shell/page-container";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import { primaryImageOf } from "@/lib/domain/media/entity";
import { DEFAULT_QUERY } from "@/lib/domain/products/list-query";
import { dbProductRepo } from "@/lib/domain/products/repository";

import { CategoriesTable } from "./categories-table";
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
  const [categories, links, selected] = await Promise.all([
    dbCategoryRepo.listWithCounts(),
    dbCategoryRepo.listLinks(),
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

      <CategoryWorkspace
        categories={categories}
        links={links}
        contents={
          <CategoryContents title={contents.title} rows={contents.rows} />
        }
      />

      <div className="pt-2">
        <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          All categories
        </h2>
        <CategoriesTable categories={categories} links={links} />
      </div>
    </PageContainer>
  );
}

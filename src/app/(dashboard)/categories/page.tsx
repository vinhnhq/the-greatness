import { PageContainer } from "@/components/app-shell/page-container";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";

import { CategoriesTable } from "./categories-table";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  // Two reads, both small. The counts come back per category; the links come
  // back whole because a subtree count has to be distinct rather than summed
  // — a product linked to a group *and* to one of its children is one
  // product. See `categories/tree.ts`.
  const [categories, links] = await Promise.all([
    dbCategoryRepo.listWithCounts(),
    dbCategoryRepo.listLinks(),
  ]);

  return (
    <PageContainer>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Grouped as the storefront groups them. Deleting a category removes it
          from its products and never deletes a product.
        </p>
      </div>
      <CategoriesTable categories={categories} links={links} />
    </PageContainer>
  );
}

import { PageContainer } from "@/components/app-shell/page-container";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";

import { CategoriesTable } from "./categories-table";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  // One query for the rows and their product counts — see `listWithCounts`.
  const categories = await dbCategoryRepo.listWithCounts();

  return (
    <PageContainer>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Categories</h1>
        <p className="text-sm text-muted-foreground">
          Deleting a category removes it from its products. It never deletes a
          product.
        </p>
      </div>
      <CategoriesTable categories={categories} />
    </PageContainer>
  );
}

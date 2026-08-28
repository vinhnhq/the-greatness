import { BreadcrumbTitle } from "@/components/app-shell/breadcrumb-title";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";

import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  const categories = await dbCategoryRepo.list();

  return (
    <div className="flex flex-col gap-4">
      <BreadcrumbTitle title="New product" />
      <h1 className="text-xl font-semibold tracking-tight">New product</h1>
      <ProductForm product={null} categories={categories} />
    </div>
  );
}

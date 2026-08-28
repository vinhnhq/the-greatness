import { notFound } from "next/navigation";

import { BreadcrumbTitle } from "@/components/app-shell/breadcrumb-title";
import { dbCategoryRepo } from "@/lib/domain/categories/repository";
import type { ProductId } from "@/lib/domain/products/entity";
import { dbProductRepo } from "@/lib/domain/products/repository";
import { isId } from "@/lib/id";

import { ProductForm } from "../product-form";
import { StatusBadge } from "../products-table";

export async function generateMetadata({
  params,
}: PageProps<"/products/[id]">) {
  const { id } = await params;
  // The handle is an id or a slug — `isId` is the one place that is decided,
  // so an id-shaped URL does not fall through to a slug lookup and 404.
  const product = isId(id)
    ? await dbProductRepo.getById(id as ProductId)
    : await dbProductRepo.getBySlug(id);
  return { title: product?.name ?? "Product" };
}

export default async function EditProductPage({
  params,
}: PageProps<"/products/[id]">) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    isId(id)
      ? dbProductRepo.getById(id as ProductId)
      : dbProductRepo.getBySlug(id),
    dbCategoryRepo.list(),
  ]);

  if (!product) notFound();

  return (
    <div className="flex flex-col gap-4">
      {/* Renders nothing — replaces the uuid in the breadcrumb. */}
      <BreadcrumbTitle title={product.name} />
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{product.name}</h1>
        <StatusBadge status={product.status} />
        <code className="text-xs text-muted-foreground">/{product.slug}</code>
      </div>
      <ProductForm product={product} categories={categories} />
    </div>
  );
}

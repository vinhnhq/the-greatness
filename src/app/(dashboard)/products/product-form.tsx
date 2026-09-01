"use client";

/**
 * One form for both create and edit — the two differ only in what they start
 * from and where they navigate afterwards. Two forms would be two places to
 * add a field and one place to forget.
 *
 * Notable:
 *
 *   - **The slug follows the name until you touch it.** Typing a slug sets a
 *     flag and the name stops overwriting it. The alternative — a slug that
 *     silently reverts on the next keystroke in the name field — is a bug
 *     people work around by saving twice.
 *   - **A new product's id is minted here, before the first upload.** The
 *     storage key is scoped by product id, so either the id exists up front
 *     or every file is uploaded somewhere temporary and moved on save. This
 *     is the cheaper half of that trade.
 *   - **Price is text, parsed once.** `<input type="number">` rejects the
 *     thousands separators people actually type, and `250.000` in VND has to
 *     mean 250000. `lib/money.ts` owns that reading.
 */

import { Loader2, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/lib/domain/categories/entity";
import type { CategoryId } from "@/lib/domain/categories/entity";
import type { MediaAsset } from "@/lib/domain/media/entity";
import {
  PRODUCT_STATUSES,
  type ProductStatus,
  type ProductWithRelations,
} from "@/lib/domain/products/entity";
import {
  CURRENCIES,
  type Currency,
  parseMoney,
  toDecimalString,
} from "@/lib/money";
import { slugify } from "@/lib/slug";

import { deleteProduct, saveProduct } from "./actions";
import { CategoryPicker } from "./category-picker";
import { ProductMediaField } from "./media-field";

function FieldError({ message }: { readonly message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function ProductForm({
  product,
  categories,
}: {
  readonly product: ProductWithRelations | null;
  readonly categories: readonly Category[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, startDeleting] = useTransition();

  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(product));
  const [sku, setSku] = useState(product?.sku ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [currency, setCurrency] = useState<Currency>(
    product?.currency ?? "VND",
  );
  const [price, setPrice] = useState(
    product ? toDecimalString(product.priceMinor, product.currency) : "",
  );
  const [status, setStatus] = useState<ProductStatus>(
    product?.status ?? "draft",
  );
  const [categoryIds, setCategoryIds] = useState<readonly CategoryId[]>(
    product?.categoryIds ?? [],
  );
  // Links, in this product's gallery order. The assets themselves live in
  // the library; this is which ones and in what order.
  const [media, setMedia] = useState<readonly MediaAsset[]>(
    product?.media ?? [],
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  const onNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const submit = () => {
    setErrors({});
    const parsed = parseMoney(price, currency);

    startTransition(async () => {
      const result = await saveProduct({
        id: product?.id,
        name,
        slug,
        sku,
        description,
        priceMinor: parsed.ok ? parsed.value : null,
        currency,
        status,
        categoryIds: [...categoryIds],
        // Ids in gallery order; the array index becomes `position`.
        mediaIds: media.map((a) => a.id as string),
      });

      if (result.status === "invalid") {
        setErrors(result.errors);
        toast.error("Some fields need attention.");
        return;
      }
      if (result.status === "missing") {
        toast.error("That product no longer exists.");
        router.push("/products");
        return;
      }
      if (result.status !== "saved") return;
      toast.success(product ? "Product saved." : "Product created.");
      router.push(`/products/${result.id}`);
      router.refresh();
    });
  };

  const confirmDelete = () => {
    startDeleting(async () => {
      if (!product) return;
      const result = await deleteProduct(product.id);
      if (!result.ok) {
        toast.error("That product could not be deleted.");
        return;
      }
      toast.success("Product deleted.");
      router.push("/products");
      router.refresh();
    });
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Name and price are what the catalogue is sorted and searched by.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "name-error" : undefined}
                autoComplete="off"
              />
              <span id="name-error">
                <FieldError message={errors.name} />
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="slug">URL slug</Label>
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                  aria-invalid={Boolean(errors.slug)}
                  autoComplete="off"
                  placeholder="derived-from-the-name"
                />
                <FieldError message={errors.slug} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  aria-invalid={Boolean(errors.sku)}
                  autoComplete="off"
                  placeholder="Optional"
                />
                <FieldError message={errors.sku} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                aria-invalid={Boolean(errors.description)}
              />
              <FieldError message={errors.description} />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="price">Price</Label>
                <Input
                  id="price"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  aria-invalid={Boolean(errors.price)}
                  autoComplete="off"
                  placeholder={currency === "VND" ? "250000" : "19.99"}
                />
                <FieldError message={errors.price} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => setCurrency(v as Currency)}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError message={errors.currency} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as ProductStatus)}
              >
                <SelectTrigger aria-label="Product status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_STATUSES.map((value) => (
                    <SelectItem
                      key={value}
                      value={value}
                      className="capitalize"
                    >
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={errors.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
              <CardDescription>
                A product can sit in several. Grouped as the storefront groups
                them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No categories yet — create one from the Categories page.
                </p>
              ) : (
                <CategoryPicker
                  categories={categories}
                  selected={categoryIds}
                  onChange={setCategoryIds}
                />
              )}
              <FieldError message={errors.categoryIds} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
          <CardDescription>
            Pick from the library, or upload — anything uploaded here joins the
            library too. Each file is stored twice: the original, and an
            optimized copy the catalogue serves. The first image is the
            product&rsquo;s primary.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductMediaField media={media} onChange={setMedia} />
          <FieldError message={errors.mediaIds} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {product ? "Save changes" : "Create product"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/products")}
        >
          Cancel
        </Button>

        <span aria-live="polite" className="sr-only">
          {pending ? "Saving" : ""}
        </span>

        {product && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="ml-auto text-destructive hover:text-destructive"
                disabled={deleting}
                aria-busy={deleting}
              >
                {deleting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete &ldquo;{product.name}&rdquo;?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the product and its category links, and takes its{" "}
                  {product.media.length} media file
                  {product.media.length === 1 ? "" : "s"} off it. The files
                  themselves stay in the library. To take the product out of the
                  catalogue without losing it, set the status to archived
                  instead.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={confirmDelete}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </form>
  );
}

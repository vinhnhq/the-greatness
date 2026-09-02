"use client";

/**
 * The product detail beside the tree: the fields a filing session actually
 * touches, and a way out to the full editor.
 *
 * **Deliberately not `ProductForm`.** That one carries the description, the
 * media field and the library picker, all of which want a full page's width
 * and none of which anyone opens while filing 697 products into categories.
 * The trade is real — two places to add a field — so this form sends the
 * whole `SaveProductInput` and simply passes the fields it does not show
 * straight back. It cannot silently blank one.
 *
 * The image is a preview, not an editor. `MediaThumb` because a bare `<img>`
 * would hand the browser the 1.76 MB archive for a 64px box.
 */

import { ExternalLink, ImageIcon, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cloneElement, useId, useState, useTransition } from "react";
import { toast } from "sonner";

import { MediaThumb } from "@/components/media-thumb";
import { SapoLink } from "@/components/sapo-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MediaAsset } from "@/lib/domain/media/entity";
import type { ProductStatus } from "@/lib/domain/products/entity";
import { PRODUCT_STATUSES } from "@/lib/domain/products/entity";
import type { Currency } from "@/lib/money";
import { parseMoney, toDecimalString } from "@/lib/money";
import { sapoProductUrl } from "@/lib/sapo";

import { saveProduct } from "../products/actions";

/** What the pane needs. Everything else the save has to echo back unchanged. */
export type QuickEditProduct = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly sku: string | null;
  readonly description: string | null;
  readonly priceMinor: number | null;
  readonly currency: Currency;
  readonly status: ProductStatus;
  readonly sapoId: string | null;
  readonly image: MediaAsset | null;
  readonly mediaIds: readonly string[];
  readonly categoryIds: readonly string[];
  /** Name and full path for each category it is in — the "In" row. */
  readonly memberships: readonly {
    readonly id: string;
    readonly name: string;
    readonly path: readonly string[];
  }[];
};

export function ProductQuickEdit({
  product,
}: {
  readonly product: QuickEditProduct;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Keyed by id at the call site, so switching products remounts and these
  // start from the new row rather than keeping the last one's edits.
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [sku, setSku] = useState(product.sku ?? "");
  const [status, setStatus] = useState<ProductStatus>(product.status);
  const [price, setPrice] = useState(
    product.priceMinor === null
      ? ""
      : toDecimalString(product.priceMinor, product.currency),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    setErrors({});
    // Price is text, parsed once: `<input type="number">` rejects the
    // thousands separators people type, and `250.000` in VND means 250000.
    const parsed =
      price.trim() === "" ? null : parseMoney(price, product.currency);
    if (parsed !== null && !parsed.ok) {
      setErrors({ priceMinor: "That is not a price." });
      return;
    }

    startTransition(async () => {
      const result = await saveProduct({
        id: product.id,
        name,
        slug,
        sku,
        // Not shown here, so echoed back. Sending "" would blank it.
        description: product.description ?? "",
        priceMinor: parsed === null ? null : parsed.value,
        currency: product.currency,
        status,
        categoryIds: product.categoryIds,
        mediaIds: product.mediaIds,
      });

      if (result.status === "invalid") {
        setErrors(result.errors);
        return;
      }
      if (result.status === "missing") {
        toast.error("That product is gone.");
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  };

  return (
    // Capped rather than filling the column: a form is read down, and a
    // 700px-wide text input is harder to scan than a 400px one.
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted ring-1 ring-border ring-inset">
          {product.image ? (
            <MediaThumb asset={product.image} sizes="64px" />
          ) : (
            // A muted `ImageIcon`, never `ImageOff`: 63 products genuinely
            // have no picture, and a crossed-out icon reads as a load failure.
            <ImageIcon
              className="size-5 text-muted-foreground/50"
              aria-hidden
            />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{product.name}</h2>
          <code className="block truncate text-xs text-muted-foreground">
            /{product.slug}
          </code>
          {/* Renders nothing for a product created here. */}
          <SapoLink url={sapoProductUrl(product.sapoId)} label="Sapo" />
        </div>
      </div>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Name" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Slug" error={errors.slug}>
          <Input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="font-mono text-xs"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU" error={errors.sku}>
            <Input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="font-mono text-xs"
            />
          </Field>

          <Field
            label={`Price (${product.currency})`}
            error={errors.priceMinor}
          >
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              className="tabular-nums"
            />
          </Field>
        </div>

        <Field label="Status" error={errors.status}>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ProductStatus)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">In</span>
          {product.memberships.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No category. Drag it onto one in the tree.
            </p>
          ) : (
            // Names, with the path as a tooltip. One product here sits in
            // eleven categories and ten of those paths are the same three
            // words — spelling each one out turns a chip list into a wall and
            // pushes the Save button off screen.
            <ul className="flex flex-wrap gap-1.5">
              {product.memberships.map((m) => (
                <li key={m.id}>
                  <Badge
                    variant="secondary"
                    className="font-normal"
                    title={[...m.path, m.name].join(" › ")}
                  >
                    {m.name}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" disabled={pending} aria-busy={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Save
          </Button>

          <Link
            href={`/products/${product.id}`}
            className="ms-auto inline-flex items-center gap-1 rounded-sm text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Open full editor
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </div>
      </form>
    </div>
  );
}

/**
 * A labelled control. The id is minted here and handed to the child through
 * `cloneElement`, because a `<Label>` with no `htmlFor` is decoration — the
 * control has no accessible name, screen readers announce "edit text, blank",
 * and clicking the label does nothing. An e2e query by role and name is what
 * caught it.
 */
function Field({
  label,
  error,
  children,
}: {
  readonly label: string;
  readonly error?: string;
  readonly children: React.ReactElement<{ id?: string }>;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      {cloneElement(children, { id })}
      {error !== undefined && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

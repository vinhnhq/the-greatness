"use client";

/**
 * The product form's category field.
 *
 * It used to render all 211 categories as one flat checkbox list — fine for
 * the eight the demo had, a wall once the real taxonomy arrived. Worth saying
 * what the bar is: **Sapo's own admin is also flat**, and worse, because its
 * order puts a child four rows above its parent with no indentation, so
 * "Đèn thông minh", "Bóng đèn thông minh" and "Chiếu sáng thông minh" sit
 * near each other with nothing to say which contains which. Grouping here is
 * an improvement on the source, not parity with it.
 *
 * Three things do the work:
 *
 * - **The tree**, indented, with groups collapsed. 6 rows to start instead of
 *   211.
 * - **Search**, folded the same way product search is (`foldForSearch`), so
 *   `quat dung` finds `Quạt đứng`. A branch survives if any descendant
 *   matches, or the results lose the context that tells the near-identical
 *   names apart — and each match is captioned with its ancestors.
 * - **The selection stays visible** as removable chips above the list, so
 *   narrowing the list never hides what is already chosen. That matters most
 *   while searching, when the checked row is usually filtered out of view.
 *
 * Pure helpers live in `domain/categories/tree.ts`; this file imports no
 * repository, which would drag the driver into the browser bundle.
 */

import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category, CategoryId } from "@/lib/domain/categories/entity";
import type { CategoryNode } from "@/lib/domain/categories/tree";
import {
  ancestorNames,
  buildCategoryForest,
  filterForest,
} from "@/lib/domain/categories/tree";
import { foldForSearch } from "@/lib/search-text";

type PickerCategory = Category & { readonly productCount: number };

export function CategoryPicker({
  categories,
  selected,
  onChange,
}: {
  readonly categories: readonly Category[];
  readonly selected: readonly CategoryId[];
  readonly onChange: (next: readonly CategoryId[]) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  // `productCount` is not shown here — the picker is about where a product
  // goes, not how full a category is — but the forest builder wants the
  // shape, so it is supplied as zero rather than plumbing a second read
  // through the form.
  const rows: readonly PickerCategory[] = categories.map((c) => ({
    ...c,
    productCount: 0,
  }));
  const forest = buildCategoryForest(rows, []);

  const folded = foldForSearch(term.trim());
  const searching = folded !== "";
  const visible = searching
    ? filterForest(forest, (c) => foldForSearch(c.name).includes(folded))
    : forest;

  const isOpen = (id: string): boolean => searching || open.has(id);

  const toggleOpen = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleChecked = (id: CategoryId, checked: boolean) =>
    onChange(
      checked
        ? [...selected, id]
        : selected.filter((existing) => existing !== id),
    );

  const byId = new Map(categories.map((c) => [c.id, c]));

  const renderNode = (node: CategoryNode<PickerCategory>) => {
    const id = node.category.id;
    const hasChildren = node.children.length > 0;
    const path = searching ? ancestorNames(rows, id) : [];

    return (
      <li key={id}>
        <div
          className="flex items-center gap-1"
          style={{ paddingLeft: `${node.depth * 1.15}rem` }}
        >
          {hasChildren && !searching ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              onClick={() => toggleOpen(id)}
              aria-expanded={isOpen(id)}
              aria-label={`${isOpen(id) ? "Collapse" : "Expand"} ${node.category.name}`}
            >
              {isOpen(id) ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </Button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}

          <Label className="flex min-w-0 cursor-pointer items-center gap-2 py-1 font-normal">
            <Checkbox
              checked={selected.includes(id)}
              onCheckedChange={(value) => toggleChecked(id, value === true)}
            />
            {/* The name never wraps; the path beside it truncates instead. */}
            <span
              className={`whitespace-nowrap ${hasChildren ? "font-medium" : ""}`}
            >
              {node.category.name}
            </span>
            {/* Nine fan categories have near-identical names; the path is
                what tells a search result apart from its siblings. */}
            {path.length > 0 && (
              <span className="truncate text-xs text-muted-foreground">
                {path.join(" › ")}
              </span>
            )}
          </Label>
        </div>

        {hasChildren && isOpen(id) && (
          <ul>{node.children.map((child) => renderNode(child))}</ul>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <li key={id}>
              <Badge variant="secondary" className="gap-1 pe-1">
                {byId.get(id)?.name ?? "Unknown category"}
                <button
                  type="button"
                  onClick={() => toggleChecked(id, false)}
                  aria-label={`Remove ${byId.get(id)?.name ?? "category"}`}
                  className="rounded-sm opacity-70 hover:opacity-100"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search categories"
          aria-label="Search categories"
          className="h-8 ps-8"
        />
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No category matches &ldquo;{term}&rdquo;.
        </p>
      ) : (
        <ul className="max-h-72 overflow-y-auto">
          {visible.map((node) => renderNode(node))}
        </ul>
      )}
    </div>
  );
}

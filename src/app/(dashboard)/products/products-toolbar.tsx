"use client";

/**
 * Search, status, category and sort — all of which write to the URL rather
 * than to component state.
 *
 * That is the whole design of this page: the URL is the query, so a filtered
 * view is linkable, survives a reload, and lets the server do the filtering
 * against an index instead of shipping the catalogue to the browser.
 *
 * The search box is the one control that cannot navigate on every keystroke.
 * It keeps a local value for immediate feedback and pushes to the URL after a
 * pause — without the local copy, each navigation would re-render the input
 * from the URL and the cursor would jump.
 */

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/lib/domain/categories/entity";
import type { CategoryId } from "@/lib/domain/categories/entity";
import { PRODUCT_STATUSES } from "@/lib/domain/products/entity";
import {
  DEFAULT_QUERY,
  productListHref,
  type ProductListQuery,
  withQuery,
} from "@/lib/domain/products/list-query";

const SEARCH_DEBOUNCE_MS = 300;

const SORT_LABELS: Record<ProductListQuery["sort"], string> = {
  "updated-desc": "Recently updated",
  "updated-asc": "Least recently updated",
  "name-asc": "Name A–Z",
  "name-desc": "Name Z–A",
  "price-asc": "Price low to high",
  "price-desc": "Price high to low",
};

export function ProductsToolbar({
  query,
  categories,
}: {
  readonly query: ProductListQuery;
  readonly categories: readonly Category[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query.search);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (patch: Partial<ProductListQuery>) => {
    startTransition(() =>
      router.push(productListHref(withQuery(query, patch))),
    );
  };

  // The URL can change without this component typing anything — a Reset click,
  // the browser's back button — and the input has to follow it.
  useEffect(() => setSearch(query.search), [query.search]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onSearchChange = (value: string) => {
    setSearch(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () => go({ search: value.trim() }),
      SEARCH_DEBOUNCE_MS,
    );
  };

  const isFiltered =
    query.search !== "" || query.status !== "all" || query.categoryId !== null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-pending={pending || undefined}
    >
      <div className="relative min-w-56 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name, SKU or description"
          aria-label="Search products"
          className="pl-8"
        />
      </div>

      <Select
        value={query.status}
        onValueChange={(value) =>
          go({ status: value as ProductListQuery["status"] })
        }
      >
        <SelectTrigger size="sm" className="w-36" aria-label="Filter by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {PRODUCT_STATUSES.map((status) => (
            <SelectItem key={status} value={status} className="capitalize">
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={query.categoryId ?? "all"}
        onValueChange={(value) =>
          go({ categoryId: value === "all" ? null : (value as CategoryId) })
        }
      >
        <SelectTrigger
          size="sm"
          className="w-44"
          aria-label="Filter by category"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={query.sort}
        onValueChange={(value) =>
          go({ sort: value as ProductListQuery["sort"] })
        }
      >
        <SelectTrigger size="sm" className="w-52" aria-label="Sort products">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            startTransition(() => router.push(productListHref(DEFAULT_QUERY)))
          }
        >
          <X className="size-4" /> Reset
        </Button>
      )}
    </div>
  );
}

/**
 * The product list's query state, parsed from and written back to the URL.
 *
 * The URL is the source of truth for search, filters, sort and page, so a
 * filtered view is linkable and survives a reload — which is the difference
 * between "send me the archived ones" being a sentence and being a screenshot.
 *
 * That also makes every field **untrusted input**. `sort` in particular ends
 * up in an `ORDER BY`: parsing it against a closed set here is what stops a
 * caller naming a column, and it is why this module is pure and heavily
 * tested rather than inlined into the page.
 */

import type { CategoryId } from "../categories/entity";
import { isProductStatus, type ProductStatus } from "./entity";

export const SORTS = [
  "updated-desc",
  "updated-asc",
  "name-asc",
  "name-desc",
  "price-asc",
  "price-desc",
] as const;
export type ProductSort = (typeof SORTS)[number];

/**
 * The "in no category at all" filter, as a URL value.
 *
 * A third state for the category facet rather than a separate flag: the two
 * are mutually exclusive, and one control that reads "Any category / …
 * / Uncategorised" is the honest shape. Safe against a real category id
 * because ids are UUIDv7 and this is not.
 *
 * 697 of 832 products are in this state today, which is the number the
 * taxonomy work exists to move.
 */
export const UNCATEGORIZED = "none";
export type UncategorizedFilter = typeof UNCATEGORIZED;

export const DEFAULT_SORT: ProductSort = "updated-desc";
export const PAGE_SIZE = 25;
export const MAX_SEARCH_LENGTH = 100;

export type ProductListQuery = {
  /** Trimmed; empty means "no search", never a `LIKE '%%'`. */
  readonly search: string;
  readonly status: ProductStatus | "all";
  /** A category, `UNCATEGORIZED` for products in none, or null for any. */
  readonly categoryId: CategoryId | UncategorizedFilter | null;
  readonly sort: ProductSort;
  /** 1-based. */
  readonly page: number;
};

export const DEFAULT_QUERY: ProductListQuery = {
  search: "",
  status: "all",
  categoryId: null,
  sort: DEFAULT_SORT,
  page: 1,
};

const isSort = (value: string): value is ProductSort =>
  (SORTS as readonly string[]).includes(value);

/** Accepts anything Next hands a page as `searchParams` — a bare string, a
 * repeated key as an array, or nothing at all. */
type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/**
 * Parse, never validate-and-throw. Every unrecognised value falls back to its
 * default: a bad URL should show the default list, not an error page, because
 * the most common source of one is a link someone edited by hand.
 */
export const parseProductListQuery = (raw: RawParams): ProductListQuery => {
  const status = first(raw.status);
  const sort = first(raw.sort);
  const category = first(raw.category).trim();
  const page = Number.parseInt(first(raw.page), 10);

  return {
    search: first(raw.q).trim().slice(0, MAX_SEARCH_LENGTH),
    status: isProductStatus(status) ? status : "all",
    categoryId:
      category === ""
        ? null
        : category === UNCATEGORIZED
          ? UNCATEGORIZED
          : (category as CategoryId),
    sort: isSort(sort) ? sort : DEFAULT_SORT,
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
};

/**
 * Back to a query string, omitting anything at its default so the canonical
 * "no filters" URL is `/products` rather than
 * `/products?q=&status=all&sort=updated-desc&page=1`.
 */
export const toSearchParams = (query: ProductListQuery): URLSearchParams => {
  const params = new URLSearchParams();
  if (query.search !== "") params.set("q", query.search);
  if (query.status !== "all") params.set("status", query.status);
  if (query.categoryId) params.set("category", query.categoryId);
  if (query.sort !== DEFAULT_SORT) params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  return params;
};

export const productListHref = (query: ProductListQuery): string => {
  const qs = toSearchParams(query).toString();
  return qs === "" ? "/products" : `/products?${qs}`;
};

/**
 * Change one facet. Any change other than paging returns to page 1 — staying
 * on page 4 while narrowing a 200-row list to 12 shows an empty table, which
 * reads as "no results" rather than "you are past the end".
 */
export const withQuery = (
  query: ProductListQuery,
  patch: Partial<ProductListQuery>,
): ProductListQuery => {
  const next = { ...query, ...patch };
  return "page" in patch ? next : { ...next, page: 1 };
};

/** How many pages a total spans — at least 1, so an empty list still renders
 * "page 1 of 1" rather than "page 1 of 0". */
export const pageCount = (total: number, pageSize = PAGE_SIZE): number =>
  Math.max(1, Math.ceil(total / pageSize));

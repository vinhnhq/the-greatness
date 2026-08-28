/**
 * The gallery's query state, parsed from and written back to the URL.
 *
 * Same shape and same reasoning as `list-query.ts`: the URL is the query, so a
 * filtered gallery is linkable, and every field is untrusted input that gets
 * parsed against a closed set rather than validated.
 *
 * The page size is much larger than the product list's. A gallery is scanned,
 * not read — sixty thumbnails is one or two screens of scrolling, where
 * twenty-five would put a pager in front of someone every few seconds.
 */

import type { ProductId } from "./entity";

export const MEDIA_KINDS = ["all", "image", "video"] as const;
export type MediaFilter = (typeof MEDIA_KINDS)[number];

export const MEDIA_PAGE_SIZE = 60;

export type MediaQuery = {
  readonly kind: MediaFilter;
  /** Only this product's media, or all of it. */
  readonly productId: ProductId | null;
  /** 1-based. */
  readonly page: number;
};

export const DEFAULT_MEDIA_QUERY: MediaQuery = {
  kind: "all",
  productId: null,
  page: 1,
};

const isMediaFilter = (value: string): value is MediaFilter =>
  (MEDIA_KINDS as readonly string[]).includes(value);

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? "";

/** Parse, never validate-and-throw: a hand-edited URL should show the default
 * gallery, not an error page. */
export const parseMediaQuery = (raw: RawParams): MediaQuery => {
  const kind = first(raw.kind);
  const product = first(raw.product).trim();
  const page = Number.parseInt(first(raw.page), 10);

  return {
    kind: isMediaFilter(kind) ? kind : "all",
    productId: product === "" ? null : (product as ProductId),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
};

/** Back to a query string, omitting anything at its default so the canonical
 * "everything" URL is `/gallery`. */
export const toMediaSearchParams = (query: MediaQuery): URLSearchParams => {
  const params = new URLSearchParams();
  if (query.kind !== "all") params.set("kind", query.kind);
  if (query.productId) params.set("product", query.productId);
  if (query.page > 1) params.set("page", String(query.page));
  return params;
};

export const galleryHref = (query: MediaQuery): string => {
  const qs = toMediaSearchParams(query).toString();
  return qs === "" ? "/gallery" : `/gallery?${qs}`;
};

/** Change one facet. Anything but paging returns to page 1 — narrowing while
 * on page 4 otherwise shows an empty grid that reads as "no media". */
export const withMediaQuery = (
  query: MediaQuery,
  patch: Partial<MediaQuery>,
): MediaQuery => {
  const next = { ...query, ...patch };
  return "page" in patch ? next : { ...next, page: 1 };
};

export const mediaPageCount = (
  total: number,
  pageSize = MEDIA_PAGE_SIZE,
): number => Math.max(1, Math.ceil(total / pageSize));

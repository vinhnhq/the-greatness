/**
 * Links back to Sapo, which is where an edit is actually made.
 *
 * This dashboard is a companion view, not a replacement: it is the pleasant
 * way to *read* the catalogue — search that handles Vietnamese, a gallery
 * worth scrolling, a list that pages — while Sapo stays the system of record
 * for orders, stock and everything a change has to be written to. An operator
 * who finds something wrong here needs one click to the row that owns it, or
 * they will hunt for it by name in a second tab and eventually stop bothering.
 *
 * **No `server-only` and no `env-server` import.** These helpers render inside
 * client components, so the store URL has to reach the browser — hence
 * `NEXT_PUBLIC_`. It is a public admin hostname, not a secret; the Sapo login
 * is what protects the destination.
 *
 * A missing id means the row was created here and has no counterpart, and
 * every function returns `null` for it rather than a URL that 404s.
 */

const DEFAULT_STORE = "https://the-greatness.mysapo.net";

/** Trailing slashes removed, so callers can concatenate without doubling up. */
const storeUrl = (): string =>
  (process.env.NEXT_PUBLIC_SAPO_STORE_URL?.trim() || DEFAULT_STORE).replace(
    /\/+$/,
    "",
  );

export const SAPO_LABEL = "Sapo";

export const sapoProductUrl = (sapoId: string | null): string | null =>
  sapoId ? `${storeUrl()}/admin/products/${encodeURIComponent(sapoId)}` : null;

export const sapoCategoryUrl = (sapoId: string | null): string | null =>
  sapoId
    ? `${storeUrl()}/admin/collections/${encodeURIComponent(sapoId)}`
    : null;

export const sapoProductListUrl = (): string => `${storeUrl()}/admin/products`;

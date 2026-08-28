/**
 * Folding text into the form the catalogue search compares against.
 *
 * The naive approach — `LOWER(name) LIKE LOWER(?)` — is wrong twice over, and
 * both were found by the integration suite rather than by reading:
 *
 *   1. **SQLite's `LOWER()` is ASCII-only.** No ICU is compiled in, so
 *      `LOWER('ÁO')` is `'ÁO'`. Searching `áo dài` for a product called
 *      `Áo Dài Lụa` returns nothing, on the one driver local development uses.
 *      Postgres folds it correctly, so the bug would only appear locally, or
 *      only in production, depending on which way you looked.
 *   2. **Nobody types diacritics into a search box.** An operator looking for
 *      `Áo Dài` types `ao dai`. Matching that is not a nicety in a Vietnamese
 *      catalogue; it is what search means.
 *
 * So the fold happens in JavaScript, where `toLowerCase()` is full Unicode,
 * and the result is stored in a `searchText` column written by the repository
 * on every save. Both sides of the comparison are then plain lowercase ASCII,
 * which `LIKE` handles identically on both drivers — the dialect difference
 * disappears rather than being papered over.
 */

/** Combining diacritical marks, U+0300–U+036F. */
const COMBINING = /[̀-ͯ]/g;

/**
 * Lowercase, strip diacritics, collapse whitespace.
 *
 * NFD decomposition separates each base letter from its marks so the marks
 * can be dropped and the letter kept. `đ` is a distinct Vietnamese letter
 * with no decomposition, so it needs its own rule or it would be stripped as
 * punctuation.
 */
export const foldForSearch = (input: string): string =>
  input
    .normalize("NFD")
    .replace(COMBINING, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * The haystack stored on a product row: everything the search box looks
 * through, folded and joined.
 *
 * One column rather than three `OR`ed `LIKE`s — which is also why search is a
 * single indexable predicate instead of a scan across three columns.
 */
export const productSearchText = (product: {
  readonly name: string;
  readonly sku: string | null;
  readonly description: string | null;
}): string =>
  foldForSearch(
    [product.name, product.sku ?? "", product.description ?? ""].join(" "),
  );

/**
 * Neutralise the wildcards a person can type. Without this, searching `100%`
 * matches every row and `_` matches any single character — silently, and only
 * for the users whose data happens to contain one.
 */
export const escapeLikePattern = (term: string): string =>
  term.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** The `LIKE` pattern for a search term: folded, escaped, wrapped. */
export const searchPattern = (term: string): string =>
  `%${escapeLikePattern(foldForSearch(term))}%`;

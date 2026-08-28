/**
 * URL slugs from human names.
 *
 * The catalogue's names are routinely Vietnamese, so the interesting case is
 * not "lowercase and dash the spaces" — it is `Áo dài lụa` becoming `ao-dai-lua`
 * rather than `-----`. Unicode normalisation (NFD) separates each base letter
 * from its combining marks so the marks can be dropped and the letter kept;
 * `đ`/`Đ` has no decomposition and needs its own rule.
 */

/** Combining diacritical marks, U+0300–U+036F. */
const COMBINING = /[̀-ͯ]/g;

export const MAX_SLUG_LENGTH = 80;

export const slugify = (input: string): string => {
  const base = input
    .normalize("NFD")
    .replace(COMBINING, "")
    // Vietnamese đ is a distinct letter, not a d with a mark, so NFD leaves
    // it alone and it would otherwise be stripped as punctuation.
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
  return base;
};

/**
 * A slug not already in `taken`, suffixed `-2`, `-3`, … as needed.
 *
 * Takes the set rather than querying: this stays pure, and the caller already
 * holds the one query it needs. A name that slugifies to nothing (an emoji, a
 * string of punctuation) falls back to `item` rather than returning `""`,
 * which would collide with every other such name and produce `/products/`.
 */
export const uniqueSlug = (
  name: string,
  taken: ReadonlySet<string>,
): string => {
  const base = slugify(name) || "item";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 10_000; n++) {
    // Trim the base so the suffix cannot push the result past the column's
    // length — a truncated slug that collides again is worse than a short one.
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  // 10k collisions on one name is not a case to handle gracefully; it is a
  // caller passing the wrong set.
  throw new Error(`Could not find a free slug for ${JSON.stringify(name)}`);
};

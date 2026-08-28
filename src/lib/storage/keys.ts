/**
 * Key validation, shared by both drivers and — critically — by the server
 * routes that accept a key from the browser.
 *
 * The client picks the key (it needs one before the upload starts, to report
 * progress against a stable id). That makes the key **untrusted input** by
 * the time a route sees it, even though this app generated it. The local
 * driver joins it onto a directory path, so a key containing `..`, a leading
 * slash, or a NUL byte writes wherever the attacker likes.
 *
 * `lib/media/naming.ts` produces keys that already satisfy this; the check
 * exists because "the client only ever sends what we generated" is an
 * assumption, not a guarantee.
 */

/** Segments of `[a-z0-9._-]`, joined by `/`, no segment empty or dot-only. */
const KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;

export const MAX_KEY_LENGTH = 256;

export const isSafeKey = (key: string): boolean => {
  if (key.length === 0 || key.length > MAX_KEY_LENGTH) return false;
  if (!KEY_RE.test(key)) return false;
  // `..` anywhere, an absolute path, a doubled slash, or a trailing slash all
  // change what a join resolves to.
  if (key.includes("..") || key.includes("//") || key.endsWith("/")) {
    return false;
  }
  return key
    .split("/")
    .every((segment) => segment.length > 0 && segment !== ".");
};

/** Throwing variant for route handlers — a bad key is a defect or an attack,
 * never a case the caller handles. */
export const assertSafeKey = (key: string): string => {
  if (!isSafeKey(key)) {
    throw new Error(`Unsafe storage key: ${JSON.stringify(key.slice(0, 80))}`);
  }
  return key;
};

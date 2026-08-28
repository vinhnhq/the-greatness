/**
 * The environment the browser is allowed to see.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, which means the
 * reads below must be **literal property accesses** — `process.env[name]`
 * with a computed key is not substituted and silently evaluates to
 * `undefined` in the browser. That is why this file looks repetitive.
 */

export const publicStorageDriver = (): "local" | "blob" =>
  process.env.NEXT_PUBLIC_STORAGE_DRIVER === "blob" ? "blob" : "local";

export const devLoginVisible = (): boolean =>
  process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "1";

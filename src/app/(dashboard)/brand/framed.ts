/**
 * The framed batch on disk, `data/thumbnails/framed/`. Shared by the page
 * (to list it) and the route (to serve one), and kept out of `route.ts`
 * because Next allows a route module no exports beyond its handlers.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export const FRAMED_DIR = path.join(
  process.cwd(),
  "data",
  "thumbnails",
  "framed",
);

/** The batch, sorted; empty when the folder is missing. */
export async function listFramed(): Promise<readonly string[]> {
  const names = await fs.readdir(FRAMED_DIR).catch(() => [] as string[]);
  return names.filter((n) => n.toLowerCase().endsWith(".png")).sort();
}

/**
 * A version tag for an image URL under `public/` or the framed folder, so a
 * re-exported file with the same name is a new URL to `next/image` — the
 * optimizer caches by URL and served a replaced logo as its old self for an
 * hour. Content-derived (size + mtime), cheap, and stable across renders.
 */
export const versionOf = async (absPath: string): Promise<string> => {
  const st = await fs.stat(absPath).catch(() => null);
  return st
    ? `${st.size.toString(36)}${Math.floor(st.mtimeMs).toString(36)}`
    : "0";
};

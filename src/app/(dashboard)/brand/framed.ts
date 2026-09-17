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

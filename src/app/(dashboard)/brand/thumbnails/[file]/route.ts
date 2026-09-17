/**
 * `GET /brand/thumbnails/<file>` — one framed thumbnail from
 * `data/thumbnails/framed/`, so `/brand` can show the whole batch through
 * `next/image` without shipping 25 MB of PNG in `public/`.
 *
 * The name is matched against the directory listing rather than resolved:
 * a request can only ever fetch a file that is actually in the folder, which
 * closes the traversal question without a second path check.
 *
 * Public, like `/uploads`, and this was learned the hard way: a session
 * gate here broke every tile, because `next/image`'s optimizer fetches the
 * source server-side with no cookie, and the gate was moot anyway once a
 * `public, max-age` response sat in the CDN for the next visitor. The page
 * that lists them is what is gated; a bare SKU-named PNG is not a secret.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { FRAMED_DIR, listFramed } from "../../framed";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  const names = await listFramed();
  if (!names.includes(file)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const bytes = await fs.readFile(path.join(FRAMED_DIR, file));
  return new NextResponse(bytes, {
    headers: {
      "content-type": "image/png",
      "content-length": String(bytes.byteLength),
      // Short: the URL carries a version, so a long TTL buys nothing and a
      // regenerated file would otherwise be pinned for an hour.
      "cache-control": "public, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}

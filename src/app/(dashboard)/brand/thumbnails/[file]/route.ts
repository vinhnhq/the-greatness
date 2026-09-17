/**
 * `GET /brand/thumbnails/<file>` — one framed thumbnail from
 * `data/thumbnails/framed/`, so `/brand` can show the whole batch through
 * `next/image` without shipping 25 MB of PNG in `public/`.
 *
 * The name is matched against the directory listing rather than resolved:
 * a request can only ever fetch a file that is actually in the folder, which
 * closes the traversal question without a second path check. Public, like
 * `/uploads`: they are storefront thumbnails, and gating them would break
 * the `<img>` tags for a signed-out reader.
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
      "cache-control": "public, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}

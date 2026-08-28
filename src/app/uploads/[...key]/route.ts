/**
 * `GET /uploads/<key>` — serves what the local storage driver wrote.
 *
 * Public by design: these are product images on an admin surface that will
 * eventually feed a storefront, and gating them behind a session would break
 * the `<img>` tags on any page rendered for a signed-out reader. That mirrors
 * the Blob driver, whose URLs are public too — so the two drivers behave the
 * same rather than one being quietly stricter.
 *
 * Immutable caching is safe because the key contains a uuid v7 attachment id:
 * a given URL's bytes never change. A replacement is a new attachment with a
 * new key.
 */

import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { localStorageDir, storageDriverName } from "@/lib/env-server";
import { isSafeKey } from "@/lib/storage/keys";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  if (storageDriverName() !== "local") {
    return new NextResponse("Not found", { status: 404 });
  }

  const key = (await params).key.join("/");
  if (!isSafeKey(key)) return new NextResponse("Not found", { status: 404 });

  const root = path.resolve(localStorageDir());
  const target = path.resolve(root, key);
  if (!target.startsWith(`${root}${path.sep}`)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const stat = await fs.stat(target).catch(() => null);
  if (!stat?.isFile()) return new NextResponse("Not found", { status: 404 });

  // Streamed rather than read into memory: a 100 MB video would otherwise
  // occupy 100 MB of the dev server's heap per concurrent request.
  const stream = Readable.toWeb(
    createReadStream(target),
  ) as unknown as ReadableStream;

  return new NextResponse(stream, {
    headers: {
      "content-type":
        CONTENT_TYPES[path.extname(target).toLowerCase()] ??
        "application/octet-stream",
      "content-length": String(stat.size),
      "cache-control": "public, max-age=31536000, immutable",
      // These are operator-supplied bytes served from our own origin. Without
      // this a crafted file could be sniffed into something executable.
      "x-content-type-options": "nosniff",
    },
  });
}

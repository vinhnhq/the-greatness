/**
 * `POST /api/attachments/local?key=…` — the local storage driver's server
 * half. Writes the request body under `.data/uploads/<key>` and returns the
 * URL to store on the attachment row.
 *
 * **Only exists when `STORAGE_DRIVER=local`.** On a Blob deployment this
 * route answers 404 rather than 405: an endpoint that writes files to a
 * serverless filesystem is not something to leave reachable in production,
 * where the write would either vanish with the instance or fill it.
 *
 * The key arrives from the browser, so it is untrusted regardless of the fact
 * that this app generated it — `assertSafeKey` is what stops it escaping the
 * uploads directory.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { localStorageDir, storageDriverName } from "@/lib/env-server";
import { kindOf, MAX_UPLOAD_BYTES } from "@/lib/media/constraints";
import { isSafeKey } from "@/lib/storage/keys";

export async function POST(request: Request): Promise<Response> {
  if (storageDriverName() !== "local") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!isSafeKey(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const mime = request.headers.get("content-type") ?? "";
  if (!kindOf(mime)) {
    return NextResponse.json({ error: "Unsupported type" }, { status: 415 });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Too large" }, { status: 413 });
  }

  const root = path.resolve(localStorageDir());
  const target = path.resolve(root, key);
  // Belt and braces over `isSafeKey`: whatever the regex missed, a resolved
  // path outside the root is not written.
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);

  return NextResponse.json({ url: `/uploads/${key}` });
}

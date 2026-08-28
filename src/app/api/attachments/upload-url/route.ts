/**
 * `POST /api/attachments/upload-url` — mints a scoped Vercel Blob token so
 * the browser can PUT bytes straight to Blob storage.
 *
 * The token is the only thing this route hands out: the bytes never pass
 * through a function, so a 100 MB video costs no function time and hits no
 * request-body limit. The gate is a session plus the same allow-list and cap
 * the client pre-flight uses, so a caller who skips the UI gets the same
 * answer the UI would have given them.
 *
 * With no `BLOB_READ_WRITE_TOKEN`, `handleUpload` throws and this answers 400
 * — the same shape as any other failed upload, so the field surfaces it
 * instead of hanging.
 */

import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { storageDriverName } from "@/lib/env-server";
import { ALLOWED_MEDIA_TYPES, MAX_UPLOAD_BYTES } from "@/lib/media/constraints";

const TOKEN_TTL_MS = 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  if (storageDriverName() !== "blob") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getSession();
        if (!session) throw new Error("Unauthenticated");
        return {
          allowedContentTypes: [...ALLOWED_MEDIA_TYPES],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
          validUntil: Date.now() + TOKEN_TTL_MS,
          tokenPayload: JSON.stringify({ userId: session.userId }),
        };
      },
      onUploadCompleted: async () => {
        // The save action records the URL on the row. Sweeping blobs whose
        // product was never saved is backlog L.1.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthenticated" ? 401 : 400 },
    );
  }
}

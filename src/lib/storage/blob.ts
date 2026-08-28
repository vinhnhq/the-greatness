"use client";

/**
 * The Vercel Blob driver's client half.
 *
 * `@vercel/blob/client`'s `upload()` PUTs the bytes from the browser straight
 * to Blob storage after a token round-trip through
 * `/api/attachments/upload-url`. The bytes never pass through a function, so
 * a 100 MB video costs no function time and hits no request-body limit.
 *
 * `addRandomSuffix: false` is set on the **server** side, in the token route:
 * the key already carries a uuid v7 attachment id, so it cannot collide, and
 * a stable key means the URL a row stores is derivable from the row itself.
 * The client cannot set it — that would let a caller choose its own key
 * policy, which is exactly what the token exists to decide.
 */

import { upload } from "@vercel/blob/client";

import type { StorageDriver, UploadInput } from "./types";

export const BLOB_TOKEN_ENDPOINT = "/api/attachments/upload-url";

export const blobDriver: StorageDriver = {
  name: "blob",
  upload: async ({ key, blob, mime, onProgress, signal }: UploadInput) => {
    const result = await upload(key, blob, {
      access: "public",
      handleUploadUrl: BLOB_TOKEN_ENDPOINT,
      contentType: mime,
      abortSignal: signal,
      onUploadProgress: ({ percentage }) => onProgress?.(percentage / 100),
    });
    return result.url;
  },
};

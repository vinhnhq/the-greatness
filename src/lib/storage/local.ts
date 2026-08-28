"use client";

/**
 * The local storage driver's client half: POST the bytes to
 * `/api/attachments/local`, which writes them under `.data/uploads/**`.
 *
 * `XMLHttpRequest` rather than `fetch`, for one reason: upload progress.
 * `fetch` still has no upload-progress event in any shipping browser
 * (`ReadableStream` request bodies are Chrome-only and need HTTP/2), and a
 * 100 MB video with no progress bar is indistinguishable from a hang.
 */

import type { StorageDriver, UploadInput } from "./types";

export const LOCAL_UPLOAD_ENDPOINT = "/api/attachments/local";

export const localDriver: StorageDriver = {
  name: "local",
  upload: ({ key, blob, mime, onProgress, signal }: UploadInput) =>
    new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        `${LOCAL_UPLOAD_ENDPOINT}?key=${encodeURIComponent(key)}`,
      );
      xhr.setRequestHeader("content-type", mime);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) onProgress?.(e.loaded / e.total);
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const body = JSON.parse(xhr.responseText) as { url: string };
          onProgress?.(1);
          resolve(body.url);
          return;
        }
        reject(new Error(`Upload failed (${xhr.status}): ${xhr.responseText}`));
      });
      xhr.addEventListener("error", () =>
        reject(new Error("Upload failed: network error")),
      );
      xhr.addEventListener("abort", () =>
        reject(new DOMException("Upload aborted", "AbortError")),
      );
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });

      xhr.send(blob);
    }),
};

"use client";

/**
 * The client-side storage entry point.
 *
 * Which driver is live is decided by the **server** and handed to the browser
 * through `NEXT_PUBLIC_STORAGE_DRIVER`, because the client cannot read
 * `STORAGE_DRIVER`. Both are read from the same value in `env-client.ts`, so
 * they cannot disagree.
 *
 * `uploadPrepared()` is what the attachments field actually calls: it takes
 * one `PreparedMedia` and uploads every artefact it carries — origin, and the
 * optimized variant or the poster when present — reporting one blended
 * progress figure, because two progress bars for one file is not information.
 */

import { attachmentKeys } from "../media/naming";
import type { PreparedMedia } from "../media/types";
import { blobDriver } from "./blob";
import { localDriver } from "./local";
import type { StorageDriver, StorageDriverName } from "./types";

export const clientDriverName = (): StorageDriverName =>
  process.env.NEXT_PUBLIC_STORAGE_DRIVER === "blob" ? "blob" : "local";

export const storageDriver = (): StorageDriver =>
  clientDriverName() === "blob" ? blobDriver : localDriver;

export type UploadedAttachment = {
  readonly originUrl: string;
  readonly optimizedUrl: string | null;
  readonly posterUrl: string | null;
};

/**
 * Upload every artefact of one prepared file.
 *
 * The origin goes **first and alone**. If it fails, nothing else is worth
 * uploading; if a derived file fails after it succeeded, the attachment is
 * still usable — so those failures are swallowed to null rather than losing
 * the file. That asymmetry is the whole point of the function.
 */
export const uploadPrepared = async (
  media: PreparedMedia,
  ids: { readonly productId: string; readonly attachmentId: string },
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedAttachment> => {
  const driver = storageDriver();
  const keys = attachmentKeys({
    ...ids,
    filename: media.origin.filename,
    mime: media.origin.mime,
  });

  const derived = media.optimized ?? media.poster;
  // Weight the blended progress by bytes, so a 40 MB origin and a 9 KB poster
  // do not each account for half the bar.
  const totalBytes = media.origin.bytes + (derived?.bytes ?? 0);
  let originFraction = 0;
  let derivedFraction = 0;
  const report = () => {
    const done =
      originFraction * media.origin.bytes +
      derivedFraction * (derived?.bytes ?? 0);
    onProgress?.(totalBytes === 0 ? 1 : done / totalBytes);
  };

  const originUrl = await driver.upload({
    key: keys.origin,
    blob: media.origin.blob,
    mime: media.origin.mime,
    signal,
    onProgress: (f) => {
      originFraction = f;
      report();
    },
  });

  if (!derived) {
    onProgress?.(1);
    return { originUrl, optimizedUrl: null, posterUrl: null };
  }

  const derivedUrl = await driver
    .upload({
      key: media.optimized ? keys.optimized : keys.poster,
      blob: derived.blob,
      mime: derived.mime,
      signal,
      onProgress: (f) => {
        derivedFraction = f;
        report();
      },
    })
    // The origin is already stored; losing the thumbnail is a cosmetic
    // degradation, and re-running the whole upload to recover it is not.
    .catch(() => null);

  onProgress?.(1);
  return {
    originUrl,
    optimizedUrl: media.optimized ? derivedUrl : null,
    posterUrl: media.poster ? derivedUrl : null,
  };
};

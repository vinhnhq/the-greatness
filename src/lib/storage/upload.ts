/**
 * Uploading one prepared file's artefacts.
 *
 * Split from `index.ts` and given the driver as a **parameter** rather than
 * reaching for it, because the rule this function encodes is the one that
 * decides whether an operator loses work:
 *
 *   - The **origin goes first, alone**. If it fails, the whole attachment
 *     fails — there is nothing worth keeping.
 *   - A **derived file failing after that does not fail the attachment**. The
 *     origin is already stored; re-running a 40 MB upload to recover a 9 KB
 *     thumbnail is a worse outcome than having no thumbnail.
 *
 * Reaching for `storageDriver()` internally would have made that asymmetry
 * reachable only through a real browser and a real network. It is instead a
 * plain unit test.
 */

import { mediaKeys } from "../media/naming";
import type { PreparedMedia } from "../media/types";
import type { StorageDriver } from "./types";

export type UploadedAttachment = {
  readonly originUrl: string;
  readonly optimizedUrl: string | null;
  readonly posterUrl: string | null;
};

export type UploadIds = {
  /** Minted in the browser before the upload starts, so progress has a stable
   * key to report against and the storage path exists before the row does. */
  readonly mediaId: string;
};

export const uploadPreparedWith = async (
  driver: StorageDriver,
  media: PreparedMedia,
  ids: UploadIds,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedAttachment> => {
  const keys = mediaKeys({
    ...ids,
    filename: media.origin.filename,
    mime: media.origin.mime,
  });

  const derived = media.optimized ?? media.poster;

  // Progress is weighted by bytes. Averaging the two fractions instead would
  // let a 9 KB poster account for half the bar while a 40 MB video crawled,
  // which reads as a stalled upload.
  const totalBytes = media.origin.bytes + (derived?.bytes ?? 0);
  let originFraction = 0;
  let derivedFraction = 0;
  const report = () => {
    if (totalBytes === 0) {
      onProgress?.(1);
      return;
    }
    const done =
      originFraction * media.origin.bytes +
      derivedFraction * (derived?.bytes ?? 0);
    onProgress?.(done / totalBytes);
  };

  const originUrl = await driver.upload({
    key: keys.origin,
    blob: media.origin.blob,
    mime: media.origin.mime,
    signal,
    onProgress: (fraction) => {
      originFraction = fraction;
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
      onProgress: (fraction) => {
        derivedFraction = fraction;
        report();
      },
    })
    // See the docblock: the origin is stored, so this loss is cosmetic.
    .catch(() => null);

  onProgress?.(1);
  return {
    originUrl,
    optimizedUrl: media.optimized ? derivedUrl : null,
    posterUrl: media.poster ? derivedUrl : null,
  };
};

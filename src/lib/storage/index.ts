"use client";

/**
 * The client-side storage entry point.
 *
 * Which driver is live is decided by the **server** and handed to the browser
 * through `NEXT_PUBLIC_STORAGE_DRIVER`, which `next.config.ts` derives from
 * the same `STORAGE_DRIVER` the server reads — one value, so the two halves
 * cannot disagree.
 *
 * The interesting logic is in `upload.ts`, which takes its driver as a
 * parameter and is therefore unit-tested. This file is the wiring.
 */

import { publicStorageDriver } from "../env-client";
import type { PreparedMedia } from "../media/types";
import { blobDriver } from "./blob";
import { localDriver } from "./local";
import type { StorageDriver, StorageDriverName } from "./types";
import {
  type UploadedAttachment,
  type UploadIds,
  uploadPreparedWith,
} from "./upload";

export type { UploadedAttachment } from "./upload";

export const clientDriverName = (): StorageDriverName => publicStorageDriver();

export const storageDriver = (): StorageDriver =>
  clientDriverName() === "blob" ? blobDriver : localDriver;

/** Upload every artefact of one prepared file through the live driver. */
export const uploadPrepared = (
  media: PreparedMedia,
  ids: UploadIds,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<UploadedAttachment> =>
  uploadPreparedWith(storageDriver(), media, ids, onProgress, signal);

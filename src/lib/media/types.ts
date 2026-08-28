/**
 * The shape `prepare()` hands to the uploader — one file, resolved into every
 * artefact that will be stored plus the metadata the row needs.
 */

import type { MediaKind } from "./constraints";

export type PreparedBlob = {
  readonly blob: Blob;
  readonly mime: string;
  readonly bytes: number;
};

export type PreparedMedia = {
  readonly kind: MediaKind;
  /** The bytes exactly as chosen. Always present — this is the file that
   * cannot be regenerated, so it is uploaded even when everything else about
   * the file failed. */
  readonly origin: PreparedBlob & { readonly filename: string };
  /** The web-delivery variant. `null` when optimization failed or would not
   * have paid for itself; the UI falls back to `origin`. */
  readonly optimized: PreparedBlob | null;
  /** Video only: the frame used as the thumbnail. */
  readonly poster: PreparedBlob | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
};

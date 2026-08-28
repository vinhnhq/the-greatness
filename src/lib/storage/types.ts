/**
 * The storage seam ([spec AC-8](../../../__project__/spec.md)).
 *
 * Two drivers, one interface:
 *
 *   - **local** — writes under `.data/uploads/**` and serves them from
 *     `/uploads/[...key]`. The default, so a fresh clone uploads a photo with
 *     no cloud account.
 *   - **blob** — Vercel Blob, uploaded **client-direct**: the browser PUTs the
 *     bytes straight to Blob and the server only mints a scoped token. A 100 MB
 *     video never passes through a function.
 *
 * The asymmetry between them is the interesting part. Local storage receives
 * bytes on the server; Blob receives them in the browser. Rather than pretend
 * otherwise, the interface is `upload(key, blob)` **on the client** — the
 * local driver POSTs to a route that writes the file, the Blob driver calls
 * `@vercel/blob/client`. Both return the URL to store on the row, and no
 * caller learns which one ran.
 */

export type StorageDriverName = "local" | "blob";

export type UploadInput = {
  /** The path within the store, from `lib/media/naming.ts`. Already
   * sanitised — the local driver joins it onto a directory. */
  readonly key: string;
  readonly blob: Blob;
  readonly mime: string;
  /** 0..1, called as bytes leave the browser. */
  readonly onProgress?: (fraction: number) => void;
  readonly signal?: AbortSignal;
};

export type StorageDriver = {
  readonly name: StorageDriverName;
  /** Returns the URL to persist on the attachment row. */
  upload(input: UploadInput): Promise<string>;
};

"use client";

/**
 * The prepare → upload → persist loop, in one place.
 *
 * Two surfaces need it now — the gallery, where files are uploaded with no
 * product in mind, and the product form, where uploading also links. Before
 * v2 this logic was welded into the attachments field; a second copy would
 * have drifted on the first bug fix, and the bugs here are the expensive kind
 * (a lost 40 MB upload, ten files where one failure kills nine).
 *
 * The three rules it enforces, unchanged from v1 and now shared:
 *
 *   1. **Files are processed one at a time.** Decoding and re-encoding ten
 *      photos concurrently pins the main thread and, on a phone, gets the tab
 *      killed. Sequential is slower on paper and finishes more often.
 *   2. **A failing file never touches the others.** Each result is folded into
 *      its own entry; the loop does not throw.
 *   3. **The library row is written only after the bytes land.** A row whose
 *      file never arrived is worse than no row: it renders as a broken image
 *      forever and nothing in the UI can explain it.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import type { MediaAsset } from "@/lib/domain/media/entity";
import { newId } from "@/lib/id";
import type { MediaRejection } from "@/lib/media/constraints";
import { MAX_ATTACHMENTS_PER_PRODUCT } from "@/lib/media/constraints";
import { type PrepareNote, prepare } from "@/lib/media/prepare";
import { uploadPrepared } from "@/lib/storage";

/** One file's journey, from dropped to stored. */
export type UploadEntry = {
  /** Minted before anything happens: it is the React key, the storage path,
   * and — once persisted — the asset's id. */
  readonly id: string;
  readonly filename: string;
  readonly state:
    | { readonly tag: "preparing" }
    | { readonly tag: "uploading"; readonly progress: number }
    | { readonly tag: "saving" }
    | {
        readonly tag: "done";
        readonly asset: MediaAsset;
        readonly notes: readonly PrepareNote[];
      }
    /** Stays in the list on purpose. Silently dropping a rejected file means
     * noticing nine of ten uploaded, days later. */
    | { readonly tag: "failed"; readonly reason: string };
};

export type UploadCallbacks = {
  /** Persist the uploaded files as library rows. Returns them in the same
   * order it was given them, so the caller can match ids. */
  readonly persist: (
    assets: readonly PersistableAsset[],
  ) => Promise<readonly MediaAsset[]>;
  /** Called once per file as it finishes, so a caller that also links can do
   * so without waiting for the whole batch. */
  readonly onAsset?: (asset: MediaAsset) => void;
};

export type PersistableAsset = {
  readonly kind: "image" | "video";
  readonly originUrl: string;
  readonly optimizedUrl: string | null;
  readonly posterUrl: string | null;
  readonly mime: string;
  readonly bytes: number;
  readonly optimizedBytes: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly alt: string | null;
};

/** Human wording for the code the pure validator returned. The validator
 * cannot know the reader; this is the render site that can. */
export const rejectionMessage = (
  rejection: MediaRejection,
  filename: string,
): string => {
  switch (rejection.tag) {
    case "UnsupportedType":
      return `${filename} is not an image or a video we can store.`;
    case "TooLarge": {
      const mb = Math.round(rejection.limit / 1024 / 1024);
      return `${filename} is larger than the ${mb} MB limit.`;
    }
    case "Empty":
      return `${filename} is empty.`;
  }
};

/** What a degraded — but successful — upload should say. An empty result
 * means everything worked and the UI says nothing. */
export const noteMessage = (note: PrepareNote): string => {
  switch (note) {
    case "image-decode-failed":
      return "could not be read for optimization; the original was stored";
    case "image-encode-failed":
      return "could not be optimized in this browser; the original was stored";
    case "optimized-not-smaller":
      return "was already smaller than an optimized copy; the original is used";
    case "video-probe-failed":
      return "has no readable metadata; the original was stored";
    case "video-poster-failed":
      return "has no thumbnail; the original was stored";
  }
};

export const useMediaUpload = ({ persist, onAsset }: UploadCallbacks) => {
  const [entries, setEntries] = useState<readonly UploadEntry[]>([]);
  const objectUrls = useRef<string[]>([]);

  // Object URLs pin their blob in memory until revoked. Twenty photos at 4 MB
  // is 80 MB still held after the page closes, which is how a long editing
  // session becomes a hung tab.
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const patch = useCallback((id: string, state: UploadEntry["state"]) => {
    setEntries((current) =>
      current.map((e) => (e.id === id ? { ...e, state } : e)),
    );
  }, []);

  const upload = useCallback(
    async (files: readonly File[], limit = MAX_ATTACHMENTS_PER_PRODUCT) => {
      const accepted = files.slice(0, Math.max(0, limit));
      if (accepted.length === 0) return;

      const created = accepted.map((file) => ({
        id: newId(),
        filename: file.name,
        state: { tag: "preparing" } as const,
      }));
      setEntries((current) => [...created, ...current]);

      // Sequential on purpose — see rule 1 in the module docblock.
      for (const [index, file] of accepted.entries()) {
        const entry = created[index];
        try {
          const prepared = await prepare(file);
          if (!prepared.ok) {
            patch(entry.id, {
              tag: "failed",
              reason: rejectionMessage(prepared.error, file.name),
            });
            continue;
          }

          const { media, notes } = prepared.value;
          patch(entry.id, { tag: "uploading", progress: 0 });

          const uploaded = await uploadPrepared(
            media,
            { mediaId: entry.id },
            (progress) => patch(entry.id, { tag: "uploading", progress }),
          );

          patch(entry.id, { tag: "saving" });

          // Rule 3: the row is written only now, with URLs that resolve.
          const [asset] = await persist([
            {
              kind: media.kind,
              originUrl: uploaded.originUrl,
              optimizedUrl: uploaded.optimizedUrl,
              posterUrl: uploaded.posterUrl,
              mime: media.origin.mime,
              bytes: media.origin.bytes,
              optimizedBytes: media.optimized?.bytes ?? null,
              width: media.width,
              height: media.height,
              durationMs: media.durationMs,
              alt: null,
            },
          ]);

          if (!asset) {
            patch(entry.id, {
              tag: "failed",
              reason: `${file.name} uploaded, but could not be saved to the library.`,
            });
            continue;
          }

          patch(entry.id, { tag: "done", asset, notes });
          onAsset?.(asset);
        } catch (error) {
          // Rule 2: one file's failure is that file's failure.
          patch(entry.id, {
            tag: "failed",
            reason:
              error instanceof Error
                ? `${file.name}: ${error.message}`
                : `${file.name} could not be uploaded.`,
          });
        }
      }
    },
    [onAsset, patch, persist],
  );

  /** Drop the finished entries once the caller has rendered them from its own
   * data — the gallery re-reads from the server, so keeping them would show
   * every file twice. */
  const clearFinished = useCallback(() => {
    setEntries((current) => current.filter((e) => e.state.tag !== "done"));
  }, []);

  const dismiss = useCallback((id: string) => {
    setEntries((current) => current.filter((e) => e.id !== id));
  }, []);

  const busy = entries.some(
    (e) =>
      e.state.tag === "preparing" ||
      e.state.tag === "uploading" ||
      e.state.tag === "saving",
  );

  return { entries, upload, busy, clearFinished, dismiss };
};

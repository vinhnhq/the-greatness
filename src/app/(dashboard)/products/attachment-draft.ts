/**
 * The client-side lifecycle of one attachment in the form.
 *
 * A draft exists from the moment a file is dropped until the product is
 * saved, and it can be in five states. Modelling that as a tagged union
 * rather than a bag of optionals is what makes the grid renderable with an
 * exhaustive `match` — every new state has to be drawn somewhere, or the
 * types stop compiling.
 *
 * `previewUrl` is an object URL over the **optimized** bytes when there are
 * any, which means the thumbnail a person sees before saving is the same file
 * that will be stored. Previewing the origin instead is the reason optimized
 * uploads get shipped without anyone noticing they are 4 MB.
 */

import type { MediaRejection } from "@/lib/media/constraints";
import type { PrepareNote } from "@/lib/media/prepare";
import type { PreparedMedia } from "@/lib/media/types";

export type AttachmentDraft = {
  /** Stable across every state change — it is the React key and, once
   * uploaded, the attachment's storage id. */
  readonly id: string;
  readonly filename: string;
  readonly state: DraftState;
};

export type DraftState =
  /** Already stored, loaded from the product being edited. */
  | {
      readonly tag: "stored";
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
      readonly alt: string;
    }
  /** Decoding and re-encoding in the browser. */
  | { readonly tag: "preparing" }
  /** Bytes in flight. */
  | {
      readonly tag: "uploading";
      readonly progress: number;
      readonly previewUrl: string | null;
      readonly media: PreparedMedia;
    }
  /** Uploaded, waiting for the product to be saved. */
  | {
      readonly tag: "ready";
      readonly kind: "image" | "video";
      readonly originUrl: string;
      readonly optimizedUrl: string | null;
      readonly posterUrl: string | null;
      readonly previewUrl: string | null;
      readonly mime: string;
      readonly bytes: number;
      readonly optimizedBytes: number | null;
      readonly width: number | null;
      readonly height: number | null;
      readonly durationMs: number | null;
      readonly alt: string;
      readonly notes: readonly PrepareNote[];
    }
  /** Rejected or failed. Stays in the list so the person can see which file
   * it was — silently dropping it means noticing nine of ten uploaded. */
  | { readonly tag: "failed"; readonly reason: string };

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

/** What a degraded — but successful — upload should tell the operator. An
 * empty result means everything worked and the UI says nothing. */
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

/** The thumbnail to draw for a draft, or null when there is nothing yet. */
export const draftPreviewUrl = (draft: AttachmentDraft): string | null => {
  const s = draft.state;
  switch (s.tag) {
    case "stored":
      return s.kind === "video" ? s.posterUrl : (s.optimizedUrl ?? s.originUrl);
    case "ready":
      return (
        s.previewUrl ??
        (s.kind === "video" ? s.posterUrl : (s.optimizedUrl ?? s.originUrl))
      );
    case "uploading":
      return s.previewUrl;
    default:
      return null;
  }
};

/** Whether a draft has something worth saving. `preparing`, `uploading` and
 * `failed` drafts are dropped from the submitted list rather than saved
 * half-formed. */
export const isSavable = (
  draft: AttachmentDraft,
): draft is AttachmentDraft & {
  readonly state: Extract<DraftState, { tag: "stored" } | { tag: "ready" }>;
} => draft.state.tag === "stored" || draft.state.tag === "ready";

/** The shape the save action expects, from a savable draft. */
export const toSubmitted = (
  draft: AttachmentDraft & {
    readonly state: Extract<DraftState, { tag: "stored" } | { tag: "ready" }>;
  },
) => {
  const s = draft.state;
  return {
    kind: s.kind,
    originUrl: s.originUrl,
    optimizedUrl: s.optimizedUrl,
    posterUrl: s.posterUrl,
    mime: s.mime,
    bytes: s.bytes,
    optimizedBytes: s.optimizedBytes,
    width: s.width,
    height: s.height,
    durationMs: s.durationMs,
    alt: s.alt.trim() === "" ? null : s.alt.trim(),
  };
};

/** Human file size, for the "4.2 MB → 310 KB" line the grid shows. That
 * comparison is the only place the optimization's value is visible. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

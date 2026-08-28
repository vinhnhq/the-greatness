"use client";

/**
 * The attachments field: drop files, watch each one get optimized and
 * uploaded, reorder them, describe them.
 *
 * Three decisions worth stating, because each has a tempting wrong version:
 *
 *   1. **Files are processed one at a time, not `Promise.all`.** Decoding and
 *      re-encoding ten photos concurrently pins the main thread and, on a
 *      phone, gets the tab killed. Sequential is slower on paper and finishes
 *      more often.
 *   2. **A failing file never touches the others.** Each file's result is
 *      folded into its own draft; the loop does not `throw`. Ten files where
 *      one is a PDF should upload nine.
 *   3. **Reordering has a keyboard path.** dnd-kit's `KeyboardSensor` plus
 *      explicit move-left / move-right buttons — a drag-only grid is
 *      unusable without a pointer, and this is the field that decides which
 *      image represents the product.
 */

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Play,
  Star,
  Trash2,
  X,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { newId } from "@/lib/id";
import {
  ALLOWED_MEDIA_TYPES,
  MAX_ATTACHMENTS_PER_PRODUCT,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "@/lib/media/constraints";
import { prepare } from "@/lib/media/prepare";
import { uploadPrepared } from "@/lib/storage";
import { cn } from "@/lib/utils";

import {
  type AttachmentDraft,
  draftPreviewUrl,
  formatBytes,
  noteMessage,
  rejectionMessage,
} from "./attachment-draft";

const ACCEPT = ALLOWED_MEDIA_TYPES.join(",");

function DraftCard({
  draft,
  index,
  count,
  isPrimary,
  onAlt,
  onRemove,
  onMove,
}: {
  readonly draft: AttachmentDraft;
  readonly index: number;
  readonly count: number;
  readonly isPrimary: boolean;
  readonly onAlt: (id: string, alt: string) => void;
  readonly onRemove: (id: string) => void;
  readonly onMove: (id: string, delta: -1 | 1) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draft.id });
  const preview = draftPreviewUrl(draft);
  const state = draft.state;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg border bg-card p-2",
        isDragging && "z-10 opacity-80 shadow-lg",
        state.tag === "failed" && "border-destructive/50",
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        {preview ? (
          // A plain <img>: the source is an object URL for an unsaved file,
          // which next/image cannot optimize and would only proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            {state.tag === "failed" ? (
              <AlertTriangle className="size-5" aria-hidden />
            ) : (
              <ImagePlus className="size-5 animate-pulse" aria-hidden />
            )}
          </div>
        )}

        {(state.tag === "stored" || state.tag === "ready") &&
          state.kind === "video" && (
            <span className="absolute bottom-1 left-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
              <Play className="size-2.5" aria-hidden /> Video
            </span>
          )}

        {isPrimary && (
          <span className="absolute left-1 top-1 flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
            <Star className="size-2.5" aria-hidden /> Primary
          </span>
        )}

        <button
          type="button"
          className="absolute right-1 top-1 cursor-grab rounded bg-background/80 p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${draft.filename}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
      </div>

      <p className="truncate text-xs font-medium" title={draft.filename}>
        {draft.filename}
      </p>

      {state.tag === "preparing" && (
        <p className="text-xs text-muted-foreground">Optimizing…</p>
      )}

      {state.tag === "uploading" && (
        <div className="flex flex-col gap-1">
          <Progress value={Math.round(state.progress * 100)} className="h-1" />
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Uploading {Math.round(state.progress * 100)}%
          </p>
        </div>
      )}

      {state.tag === "failed" && (
        <p className="text-xs text-destructive">{state.reason}</p>
      )}

      {(state.tag === "stored" || state.tag === "ready") && (
        <>
          {/* The one place the optimization's value is visible. */}
          <p className="text-[11px] text-muted-foreground">
            {formatBytes(state.bytes)}
            {state.optimizedBytes !== null && (
              <>
                {" → "}
                <span className="text-success">
                  {formatBytes(state.optimizedBytes)}
                </span>
              </>
            )}
            {state.width && state.height
              ? ` · ${state.width}×${state.height}`
              : ""}
          </p>

          {state.tag === "ready" && state.notes.length > 0 && (
            <p className="text-[11px] text-warning">
              {noteMessage(state.notes[0])}
            </p>
          )}

          <Input
            value={state.alt}
            onChange={(e) => onAlt(draft.id, e.target.value)}
            placeholder="Alt text"
            aria-label={`Alt text for ${draft.filename}`}
            className="h-7 text-xs"
          />

          <a
            href={state.originUrl}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
          >
            View original
          </a>
        </>
      )}

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={index === 0}
          onClick={() => onMove(draft.id, -1)}
          aria-label={`Move ${draft.filename} earlier`}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={index === count - 1}
          onClick={() => onMove(draft.id, 1)}
          aria-label={`Move ${draft.filename} later`}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(draft.id)}
          aria-label={`Remove ${draft.filename}`}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function AttachmentsField({
  productId,
  drafts,
  onChange,
}: {
  /** Needed before the first upload, so the storage key can be scoped to the
   * product. For a new product the form mints one up front rather than
   * uploading to a temporary place and moving the files afterwards. */
  readonly productId: string;
  readonly drafts: readonly AttachmentDraft[];
  /**
   * A **setState-style dispatch**, not a plain `(next) => void`.
   *
   * The upload loop is async: by the time file 7 finishes, `drafts` from the
   * render that started the loop is several files out of date. Reading the
   * current list through a ref written during render is the tempting fix and
   * is a render-time side effect — React may discard that render, and the
   * lint rule that flags it is right. A functional update asks React for the
   * current value instead, which is what it is for.
   */
  readonly onChange: Dispatch<SetStateAction<readonly AttachmentDraft[]>>;
}) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const objectUrls = useRef<string[]>([]);

  // Object URLs pin their blob in memory until revoked. Twenty photos at 4 MB
  // is 80 MB held after the form closes, which is how a long editing session
  // becomes a hung tab.
  useEffect(
    () => () => {
      for (const url of objectUrls.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const patch = useCallback(
    (id: string, state: AttachmentDraft["state"]) => {
      onChange((current) =>
        current.map((d) => (d.id === id ? { ...d, state } : d)),
      );
    },
    [onChange],
  );

  const addFiles = useCallback(
    async (files: readonly File[]) => {
      // `drafts` is current here: this runs from a change/drop handler, which
      // closes over the latest render. Only the loop below outlives it.
      const room = MAX_ATTACHMENTS_PER_PRODUCT - drafts.length;
      const accepted = files.slice(0, Math.max(0, room));
      if (accepted.length === 0) return;

      const created = accepted.map((file) => ({
        id: newId(),
        filename: file.name,
        state: { tag: "preparing" } as const,
      }));
      onChange((current) => [...current, ...created]);

      // Sequential on purpose — see note 1 in the module docblock.
      for (const [index, file] of accepted.entries()) {
        const draft = created[index];
        try {
          const prepared = await prepare(file);
          if (!prepared.ok) {
            patch(draft.id, {
              tag: "failed",
              reason: rejectionMessage(prepared.error, file.name),
            });
            continue;
          }

          const { media, notes } = prepared.value;
          const previewSource = media.optimized ?? media.poster ?? media.origin;
          const previewUrl = URL.createObjectURL(previewSource.blob);
          objectUrls.current.push(previewUrl);

          patch(draft.id, {
            tag: "uploading",
            progress: 0,
            previewUrl,
            media,
          });

          const uploaded = await uploadPrepared(
            media,
            { productId, attachmentId: draft.id },
            (progress) =>
              patch(draft.id, {
                tag: "uploading",
                progress,
                previewUrl,
                media,
              }),
          );

          patch(draft.id, {
            tag: "ready",
            kind: media.kind,
            originUrl: uploaded.originUrl,
            optimizedUrl: uploaded.optimizedUrl,
            posterUrl: uploaded.posterUrl,
            previewUrl,
            mime: media.origin.mime,
            bytes: media.origin.bytes,
            optimizedBytes: media.optimized?.bytes ?? null,
            width: media.width,
            height: media.height,
            durationMs: media.durationMs,
            alt: "",
            notes,
          });
        } catch (error) {
          // Note 2: one file's failure is that file's failure.
          patch(draft.id, {
            tag: "failed",
            reason:
              error instanceof Error
                ? `${file.name}: ${error.message}`
                : `${file.name} could not be uploaded.`,
          });
        }
      }
    },
    [drafts, onChange, patch, productId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onChange((current) => {
      const from = current.findIndex((d) => d.id === active.id);
      const to = current.findIndex((d) => d.id === over.id);
      return from === -1 || to === -1
        ? current
        : arrayMove([...current], from, to);
    });
  };

  const move = (id: string, delta: -1 | 1) =>
    onChange((current) => {
      const from = current.findIndex((d) => d.id === id);
      const to = from + delta;
      return from === -1 || to < 0 || to >= current.length
        ? current
        : arrayMove([...current], from, to);
    });

  const remove = (id: string) =>
    onChange((current) => current.filter((d) => d.id !== id));

  const setAlt = (id: string, alt: string) =>
    onChange((current) =>
      current.map((d) =>
        d.id === id && (d.state.tag === "ready" || d.state.tag === "stored")
          ? { ...d, state: { ...d.state, alt } }
          : d,
      ),
    );

  const primaryId = drafts.find(
    (d) =>
      (d.state.tag === "ready" || d.state.tag === "stored") &&
      d.state.kind === "image",
  )?.id;

  const busy = drafts.filter(
    (d) => d.state.tag === "preparing" || d.state.tag === "uploading",
  ).length;
  const full = drafts.length >= MAX_ATTACHMENTS_PER_PRODUCT;

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void addFiles([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25",
          full && "pointer-events-none opacity-50",
        )}
      >
        <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">
          Drop images or video, or click to choose
        </span>
        <span className="text-xs text-muted-foreground">
          JPEG · PNG · WebP · GIF up to{" "}
          {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB &nbsp;·&nbsp; MP4 ·
          WebM · MOV up to {Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB
        </span>
        <span className="text-xs text-muted-foreground">
          {drafts.length} of {MAX_ATTACHMENTS_PER_PRODUCT}
          {full && " — remove one to add another"}
        </span>
      </label>

      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          void addFiles([...(e.target.files ?? [])]);
          // Reset so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />

      <span aria-live="polite" className="sr-only">
        {busy > 0 ? `${busy} file${busy === 1 ? "" : "s"} uploading` : ""}
      </span>

      {drafts.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={drafts.map((d) => d.id)}
            strategy={rectSortingStrategy}
          >
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {drafts.map((draft, index) => (
                <DraftCard
                  key={draft.id}
                  draft={draft}
                  index={index}
                  count={drafts.length}
                  isPrimary={draft.id === primaryId}
                  onAlt={setAlt}
                  onRemove={remove}
                  onMove={move}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {drafts.some((d) => d.state.tag === "failed") && (
        <Badge variant="secondary" className="w-fit gap-1">
          <X className="size-3" aria-hidden />
          Some files were not added — see the cards above
        </Badge>
      )}
    </div>
  );
}

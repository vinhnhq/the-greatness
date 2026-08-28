"use client";

/**
 * The drop zone and the in-flight file cards, shared by the gallery and the
 * product form.
 *
 * It renders `useMediaUpload`'s entries and nothing else — it has no idea
 * whether the caller intends to link the result to a product. That split is
 * what lets one hook and one component serve both surfaces without either
 * knowing about the other.
 */

import { AlertTriangle, ImagePlus, Loader2, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { UploadEntry } from "@/hooks/use-media-upload";
import { noteMessage } from "@/hooks/use-media-upload";
import {
  ALLOWED_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "@/lib/media/constraints";
import { cn } from "@/lib/utils";

const ACCEPT = ALLOWED_MEDIA_TYPES.join(",");
const MB = 1024 * 1024;

export function UploadZone({
  entries,
  onFiles,
  onDismiss,
  disabled = false,
  hint,
  className,
}: {
  readonly entries: readonly UploadEntry[];
  readonly onFiles: (files: readonly File[]) => void;
  readonly onDismiss: (id: string) => void;
  readonly disabled?: boolean;
  readonly hint?: string;
  readonly className?: string;
}) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);

  // Only what is still moving, or has failed. A finished upload is rendered by
  // the caller from its own data — keeping it here too shows every file twice.
  const visible = entries.filter((e) => e.state.tag !== "done");
  const busy = entries.filter(
    (e) =>
      e.state.tag === "preparing" ||
      e.state.tag === "uploading" ||
      e.state.tag === "saving",
  ).length;
  const notes = entries.filter(
    (e) => e.state.tag === "done" && e.state.notes.length > 0,
  );

  return (
    <div className={cn("flex flex-col gap-3", className)}>
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
          if (!disabled) onFiles([...e.dataTransfer.files]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <ImagePlus className="size-5 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">
          Drop images or video, or click to choose
        </span>
        <span className="text-xs text-muted-foreground">
          JPEG · PNG · WebP · GIF up to {Math.round(MAX_IMAGE_BYTES / MB)} MB
          &nbsp;·&nbsp; MP4 · WebM · MOV up to{" "}
          {Math.round(MAX_VIDEO_BYTES / MB)} MB
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </label>

      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          // Reset, so choosing the same file twice still fires a change.
          e.target.value = "";
        }}
      />

      <span aria-live="polite" className="sr-only">
        {busy > 0 ? `${busy} file${busy === 1 ? "" : "s"} uploading` : ""}
      </span>

      {visible.length > 0 && (
        <ul className="flex flex-col gap-2">
          {visible.map((entry) => (
            <li
              key={entry.id}
              className={cn(
                "flex items-center gap-3 rounded-md border p-2 text-sm",
                entry.state.tag === "failed" && "border-destructive/50",
              )}
            >
              {entry.state.tag === "failed" ? (
                <AlertTriangle
                  className="size-4 shrink-0 text-destructive"
                  aria-hidden
                />
              ) : (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-muted-foreground"
                  aria-hidden
                />
              )}

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="truncate font-medium">{entry.filename}</span>
                {entry.state.tag === "uploading" && (
                  <Progress
                    value={Math.round(entry.state.progress * 100)}
                    className="h-1"
                  />
                )}
                <span className="text-xs text-muted-foreground">
                  {entry.state.tag === "preparing" && "Optimizing…"}
                  {entry.state.tag === "uploading" &&
                    `Uploading ${Math.round(entry.state.progress * 100)}%`}
                  {entry.state.tag === "saving" && "Saving to the library…"}
                  {entry.state.tag === "failed" && (
                    <span className="text-destructive">
                      {entry.state.reason}
                    </span>
                  )}
                </span>
              </div>

              {entry.state.tag === "failed" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0"
                  onClick={() => onDismiss(entry.id)}
                  aria-label={`Dismiss ${entry.filename}`}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Degradations worth surfacing without treating them as errors: the
          file uploaded, just not the way it was meant to. */}
      {notes.map((entry) =>
        entry.state.tag === "done" ? (
          <p key={entry.id} className="text-xs text-warning">
            {entry.filename} {noteMessage(entry.state.notes[0])}
          </p>
        ) : null,
      )}
    </div>
  );
}

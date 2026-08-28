"use client";

/**
 * A product's gallery: pick from the library, or upload (which adds to the
 * library and attaches in one step).
 *
 * The v2 change, and the whole point of it: this field holds **links**, not
 * files. Removing a tile here unlinks the asset and leaves it in the library
 * — a product form is not a place where files get destroyed. The wording says
 * so, because "Remove" on a photo grid reads as "delete" unless it is told
 * otherwise.
 *
 * Reordering is still local and still submitted as an array, so the array
 * index becomes `position` on save. Two products can order the same assets
 * differently, which is why the order lives on the link.
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
  ChevronLeft,
  ChevronRight,
  GripVertical,
  ImagePlus,
  Library,
  Play,
  Star,
  X,
} from "lucide-react";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useState,
} from "react";

import { UploadZone } from "@/components/media/upload-zone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type PersistableAsset,
  useMediaUpload,
} from "@/hooks/use-media-upload";
import type { MediaAsset } from "@/lib/domain/media/entity";
import { mediaSrc } from "@/lib/domain/media/entity";
import { MAX_MEDIA_PER_PRODUCT } from "@/lib/domain/products/entity";
import { cn } from "@/lib/utils";

import { createMediaAssets } from "../gallery/actions";
import { LibraryPicker } from "./library-picker";

function Tile({
  asset,
  index,
  count,
  isPrimary,
  onRemove,
  onMove,
}: {
  readonly asset: MediaAsset;
  readonly index: number;
  readonly count: number;
  readonly isPrimary: boolean;
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
  } = useSortable({ id: asset.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative flex flex-col gap-2 rounded-lg border bg-card p-2",
        isDragging && "z-10 opacity-80 shadow-lg",
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaSrc(asset)}
          alt=""
          className="size-full object-cover"
          draggable={false}
        />

        {asset.kind === "video" && (
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
          aria-label={`Reorder ${asset.alt ?? "media"}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3.5" aria-hidden />
        </button>
      </div>

      <p className="truncate text-xs text-muted-foreground">
        {asset.alt ?? (asset.kind === "video" ? "Video" : "Image")}
      </p>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={index === 0}
          onClick={() => onMove(asset.id, -1)}
          aria-label="Move earlier"
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          disabled={index === count - 1}
          onClick={() => onMove(asset.id, 1)}
          aria-label="Move later"
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto size-7 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(asset.id)}
          // Not "Delete": this unlinks, and the file stays in the library.
          aria-label={`Remove ${asset.alt ?? "media"} from this product`}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function ProductMediaField({
  media,
  onChange,
}: {
  readonly media: readonly MediaAsset[];
  /** A setState-style dispatch: the upload loop is async, and reading the
   * current list through a ref written during render is a render-time side
   * effect React may discard. */
  readonly onChange: Dispatch<SetStateAction<readonly MediaAsset[]>>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const persist = useCallback(
    async (assets: readonly PersistableAsset[]) =>
      (await createMediaAssets(assets)) as readonly MediaAsset[],
    [],
  );

  const onAsset = useCallback(
    (asset: MediaAsset) => {
      // Uploading from a product does both things at once: the asset is in
      // the library from this moment, and attached here.
      onChange((current) =>
        current.some((a) => a.id === asset.id)
          ? current
          : [...current, asset].slice(0, MAX_MEDIA_PER_PRODUCT),
      );
    },
    [onChange],
  );

  const { entries, upload, busy, dismiss } = useMediaUpload({
    persist,
    onAsset,
  });

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
      const from = current.findIndex((a) => a.id === active.id);
      const to = current.findIndex((a) => a.id === over.id);
      return from === -1 || to === -1
        ? current
        : arrayMove([...current], from, to);
    });
  };

  const move = (id: string, delta: -1 | 1) =>
    onChange((current) => {
      const from = current.findIndex((a) => a.id === id);
      const to = from + delta;
      return from === -1 || to < 0 || to >= current.length
        ? current
        : arrayMove([...current], from, to);
    });

  const remove = (id: string) =>
    onChange((current) => current.filter((a) => a.id !== id));

  const addFromLibrary = (assets: readonly MediaAsset[]) =>
    onChange((current) => {
      const have = new Set(current.map((a) => a.id));
      return [...current, ...assets.filter((a) => !have.has(a.id))].slice(
        0,
        MAX_MEDIA_PER_PRODUCT,
      );
    });

  const primaryId = media.find((a) => a.kind === "image")?.id;
  const full = media.length >= MAX_MEDIA_PER_PRODUCT;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setPickerOpen(true)}
          disabled={full}
        >
          <Library className="size-4" /> Add from library
        </Button>
        <span className="text-sm text-muted-foreground">
          {media.length} of {MAX_MEDIA_PER_PRODUCT}
          {full && " — remove one to add another"}
        </span>
      </div>

      {media.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={media.map((a) => a.id)}
            strategy={rectSortingStrategy}
          >
            <ul
              aria-label="This product's media"
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {media.map((asset, index) => (
                <Tile
                  key={asset.id}
                  asset={asset}
                  index={index}
                  count={media.length}
                  isPrimary={asset.id === primaryId}
                  onRemove={remove}
                  onMove={move}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {media.length === 0 && (
        <p className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          <ImagePlus className="size-4" aria-hidden />
          No media on this product yet.
        </p>
      )}

      <UploadZone
        entries={entries}
        onFiles={(files) =>
          void upload(files, MAX_MEDIA_PER_PRODUCT - media.length)
        }
        onDismiss={dismiss}
        disabled={full || busy}
        hint="Uploading here also adds the file to the library."
      />

      <Badge variant="secondary" className="w-fit font-normal">
        Removing a file here takes it off this product. It stays in the library.
      </Badge>

      <LibraryPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeIds={media.map((a) => a.id)}
        remaining={MAX_MEDIA_PER_PRODUCT - media.length}
        onConfirm={addFromLibrary}
      />
    </div>
  );
}

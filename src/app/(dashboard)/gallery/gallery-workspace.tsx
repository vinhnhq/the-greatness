"use client";

/**
 * The gallery's interactive shell: upload, select, delete.
 *
 * A client component wrapping the server-rendered grid, because all three of
 * those are stateful and the page itself should stay a server component that
 * is a function of the URL.
 *
 * Newly uploaded assets are held in local state and rendered **above** the
 * server's page until the router refresh lands. Without that, a file finishes
 * uploading and nothing visibly happens for a second or two, which reads as a
 * failure and gets the button pressed again.
 */

import { Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import { UploadZone } from "@/components/media/upload-zone";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  type PersistableAsset,
  useMediaUpload,
} from "@/hooks/use-media-upload";
import type { MediaAsset } from "@/lib/domain/media/entity";
import { mediaSrc } from "@/lib/domain/media/entity";
import type { LibraryItem } from "@/lib/domain/media/repository";

import { createMediaAssets, deleteMediaAssets } from "./actions";
import { GalleryGrid } from "./gallery-grid";

/** A freshly uploaded asset, shaped like a page item so the grid needs no
 * second code path. It is used by nothing yet, by definition. */
const asLibraryItem = (asset: MediaAsset): LibraryItem => ({
  asset,
  src: mediaSrc(asset),
  usedBy: [],
});

export function GalleryWorkspace({
  items,
  emptyState,
}: {
  readonly items: readonly LibraryItem[];
  /**
   * What to show when there is nothing — passed in as a server-rendered node
   * rather than decided here, because the page knows whether "nothing" means
   * an empty library or a filter that matched nothing, and those are
   * different messages with different buttons.
   *
   * The uploader stays mounted either way: an empty library is precisely the
   * state you need to upload from.
   */
  readonly emptyState: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fresh, setFresh] = useState<readonly LibraryItem[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const persist = useCallback(
    async (assets: readonly PersistableAsset[]) =>
      (await createMediaAssets(assets)) as readonly MediaAsset[],
    [],
  );

  const onAsset = useCallback((asset: MediaAsset) => {
    // Optimistic, and correct: the row is written by the time this fires.
    setFresh((current) => [asLibraryItem(asset), ...current]);
  }, []);

  const { entries, upload, busy, dismiss, clearFinished } = useMediaUpload({
    persist,
    onAsset,
  });

  const onFiles = (files: readonly File[]) => {
    void upload(files, 50).then(() => {
      startTransition(() => {
        router.refresh();
        clearFinished();
      });
    });
  };

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exitSelection = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  // Freshly uploaded assets sit above the server's page until the refresh
  // lands. Without them the grid is unchanged for a second or two after an
  // upload finishes, which reads as a failure and gets the button pressed
  // again.
  //
  // **De-duplicated by id, not cleared on a timer.** Clearing `fresh` when
  // the refresh is dispatched is a race: React holds the state update until
  // the transition completes, so for that window both copies render and every
  // file appears twice. Filtering by what the server has already sent makes
  // the local copy disappear exactly when it becomes redundant, with no flash
  // in either direction.
  const serverIds = new Set(items.map((i) => i.asset.id));
  const shown = [...fresh.filter((f) => !serverIds.has(f.asset.id)), ...items];
  const chosen = shown.filter((i) => selected.has(i.asset.id));
  // The warning that makes the delete dialog worth reading.
  const attached = chosen.filter((i) => i.usedBy.length > 0);

  const confirmDelete = () => {
    const ids = chosen.map((i) => i.asset.id as string);
    startTransition(async () => {
      const result = await deleteMediaAssets(ids);
      exitSelection();
      if (!result.ok) {
        toast.error("Those files could not be deleted.");
        return;
      }
      toast.success(
        `Deleted ${result.removed} file${result.removed === 1 ? "" : "s"}.`,
      );
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <UploadZone
        entries={entries}
        onFiles={onFiles}
        onDismiss={dismiss}
        hint="Uploaded here, they go straight to the library — attach them to a product later."
      />

      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selecting ? (
            <>
              <Button variant="ghost" size="sm" onClick={exitSelection}>
                <X className="size-4" /> Cancel
              </Button>
              <span
                className="text-sm text-muted-foreground"
                aria-live="polite"
              >
                {selected.size} selected
              </span>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-destructive hover:text-destructive"
                    disabled={selected.size === 0 || pending}
                    aria-busy={pending}
                  >
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" aria-hidden />
                    )}
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {selected.size} file
                      {selected.size === 1 ? "" : "s"}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {attached.length === 0 ? (
                        "None of these are used by a product."
                      ) : (
                        <>
                          {attached.length} of them{" "}
                          {attached.length === 1 ? "is" : "are"} used by{" "}
                          {[
                            ...new Set(
                              attached.flatMap((i) =>
                                i.usedBy.map((p) => p.name),
                              ),
                            ),
                          ].join(", ")}
                          . Deleting removes{" "}
                          {attached.length === 1 ? "it" : "them"} from those
                          products too.
                        </>
                      )}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep them</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelecting(true)}
              disabled={busy}
            >
              Select
            </Button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        emptyState
      ) : (
        <GalleryGrid
          items={shown}
          selecting={selecting}
          selected={selected}
          onToggle={toggle}
        />
      )}
    </div>
  );
}

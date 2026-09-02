"use client";

/**
 * The two prompts the row menu needs that the picker cannot serve: naming a
 * new subcategory, and confirming a delete.
 *
 * Both are here rather than inside the tree row so that 211 rows do not each
 * mount a dialog. One instance lives at the workspace, and the row's menu item
 * simply names what it should be about.
 */

import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function NewChildDialog({
  target,
  onClose,
  onCreate,
}: {
  readonly target: {
    readonly parentId: string;
    readonly parentName: string;
  } | null;
  readonly onClose: () => void;
  readonly onCreate: (parentId: string, name: string) => void;
}) {
  const [name, setName] = useState("");

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) {
          setName("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (target === null || name.trim() === "") return;
            onCreate(target.parentId, name);
            setName("");
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>New subcategory</DialogTitle>
            <DialogDescription>
              It will sit under{" "}
              <span className="text-foreground">{target?.parentName}</span>. The
              tree is ours — Sapo has nowhere to store it — so this parent
              survives the next sync.
            </DialogDescription>
          </DialogHeader>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Subcategory name"
            className="my-4"
            autoFocus
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={name.trim() === ""}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteCategoryDialog({
  target,
  onClose,
  onConfirm,
}: {
  readonly target: {
    readonly id: string;
    readonly name: string;
    readonly count: number;
  } | null;
  readonly onClose: () => void;
  readonly onConfirm: (id: string, name: string) => void;
}) {
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete &ldquo;{target?.name}&rdquo;?
          </AlertDialogTitle>
          {/* The count is stated because "delete Bags" and "delete Bags,
              which 14 products are in" are different decisions, and the
              second one is the one being made. */}
          <AlertDialogDescription>
            {target === null || target.count === 0
              ? "No products are in this category."
              : `${target.count} product${
                  target.count === 1 ? "" : "s"
                } will lose this category. The products themselves are not deleted.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (target !== null) onConfirm(target.id, target.name);
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

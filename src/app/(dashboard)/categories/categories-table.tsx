"use client";

/**
 * Categories: create, rename in place, delete.
 *
 * Renaming happens in the row rather than in a dialog. A category is a single
 * short string — a modal to change one word costs two extra clicks and a lost
 * sense of where you were in the list.
 *
 * The delete dialog states the product count, because "delete Bags" and
 * "delete Bags, which 14 products are in" are different decisions, and the
 * second one is the one being made.
 */

import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CategoryWithCount } from "@/lib/domain/categories/repository";

import { createCategory, deleteCategory, renameCategory } from "./actions";

function CategoryRow({
  category,
  busyId,
  onRename,
  onDelete,
}: {
  readonly category: CategoryWithCount;
  readonly busyId: string | null;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  // Per row and per action, so renaming one category does not freeze the
  // delete button on another.
  const busy = busyId === category.id;

  return (
    <TableRow>
      <TableCell>
        {editing ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              setEditing(false);
              onRename(category.id, draft);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`Rename ${category.name}`}
              className="h-8 max-w-56"
              autoFocus
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="size-8"
            >
              <Check className="size-4" />
              <span className="sr-only">Save</span>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => {
                setDraft(category.name);
                setEditing(false);
              }}
            >
              <X className="size-4" />
              <span className="sr-only">Cancel</span>
            </Button>
          </form>
        ) : (
          <span className="font-medium">{category.name}</span>
        )}
      </TableCell>

      <TableCell className="text-muted-foreground">
        <code className="text-xs">{category.slug}</code>
      </TableCell>

      <TableCell>
        <Badge variant="secondary">
          {category.productCount}
          <span className="sr-only"> products</span>
        </Badge>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {!editing && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onClick={() => setEditing(true)}
              disabled={busy}
              aria-label={`Rename ${category.name}`}
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
            </Button>
          )}

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                disabled={busy}
                aria-label={`Delete ${category.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete &ldquo;{category.name}&rdquo;?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {category.productCount === 0
                    ? "No products are in this category."
                    : `${category.productCount} product${
                        category.productCount === 1 ? "" : "s"
                      } will lose this category. The products themselves are not deleted.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(category.id)}>
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function CategoriesTable({
  categories,
}: {
  readonly categories: readonly CategoryWithCount[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const run = (
    id: string | null,
    work: () => Promise<
      { status: "ok" } | { status: "error"; message: string }
    >,
    success: string,
  ) => {
    setBusyId(id);
    startTransition(async () => {
      const result = await work();
      setBusyId(null);
      if (result.status === "error") toast.error(result.message);
      else toast.success(success);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName;
          setNewName("");
          run(null, () => createCategory(name), "Category created.");
        }}
      >
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category name"
          aria-label="New category name"
          className="max-w-xs"
        />
        <Button
          type="submit"
          disabled={pending || newName.trim() === ""}
          aria-busy={pending}
        >
          {pending && busyId === null ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-4" aria-hidden />
          )}
          Add
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Products</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-sm text-muted-foreground"
                >
                  No categories yet. Add one above.
                </TableCell>
              </TableRow>
            ) : (
              categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  busyId={busyId}
                  onRename={(id, name) =>
                    run(id, () => renameCategory(id, name), "Category renamed.")
                  }
                  onDelete={(id) =>
                    run(id, () => deleteCategory(id), "Category deleted.")
                  }
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

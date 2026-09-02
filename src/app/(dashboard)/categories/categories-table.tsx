"use client";

/**
 * Categories: create, rename in place, delete — **flat**, the way Sapo shows
 * them.
 *
 * The tree used to be here and is now in the Taxonomy tab, where products hang
 * off it. Rendering it twice on one page made the hierarchy look like the
 * point of this list, and it is not: this is the CRUD surface, reached
 * occasionally, and a 211-row flat table is the shape Sapo's own admin
 * presents.
 *
 * **The path column is what a flat list needs and Sapo's lacks.** "Quạt đứng"
 * alone is ambiguous among nine near-identical fan categories; "Thiết bị gia
 * đình › Quạt & Thiết bị làm mát" tells them apart. `categoryPaths` computes
 * all 211 at once — the per-row `ancestorNames` rebuilds its index every call,
 * which is a quadratic walk over a list that already fits in memory.
 *
 * The count column reads two numbers because they differ and the difference
 * matters: every top-level group in this catalogue holds **zero** products of
 * its own, so a single number makes each one look broken. The subtree number
 * counts distinct products — a product linked to a parent *and* its child is
 * one product, and eight fans that appear in nine fan categories are eight.
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
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { SapoLink } from "@/components/sapo-link";
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
import type { CategoryLink } from "@/lib/domain/categories/tree";
import {
  buildCategoryForest,
  categoryPaths,
  flattenForest,
} from "@/lib/domain/categories/tree";
import { sapoCategoryUrl } from "@/lib/sapo";
import { foldForSearch } from "@/lib/search-text";
import { cn } from "@/lib/utils";

import { createCategory, deleteCategory, renameCategory } from "./actions";

/** One table row: the category, plus what only the forest knows about it. */
type FlatCategory = {
  readonly category: CategoryWithCount;
  readonly path: readonly string[];
  readonly hasChildren: boolean;
  readonly ownCount: number;
  readonly subtreeCount: number;
};

function CategoryRow({
  row,
  busyId,
  onRename,
  onDelete,
}: {
  readonly row: FlatCategory;
  readonly busyId: string | null;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
}) {
  const { category, path, hasChildren, ownCount, subtreeCount } = row;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  // Per row and per action, so renaming one category does not freeze the
  // delete button on another.
  const busy = busyId === category.id;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1">
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
            // The way into the drill-down. The list is for editing; the link
            // is for walking down to the products.
            <Link
              href={`/categories/${category.slug}`}
              className={cn(
                "rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                hasChildren && "font-medium",
              )}
            >
              {category.name}
            </Link>
          )}
        </div>
      </TableCell>

      <TableCell className="hidden text-muted-foreground md:table-cell">
        {path.length === 0 ? (
          // A root has no path, and an em dash reads better than a blank cell
          // in a column where most rows have one.
          <span aria-label="Top level">—</span>
        ) : (
          <span className="text-xs">{path.join(" › ")}</span>
        )}
      </TableCell>

      <TableCell className="hidden text-muted-foreground sm:table-cell">
        <div className="flex items-center gap-3">
          <code className="text-xs">{category.slug}</code>
          {/* Nothing renders for a category created here. */}
          <SapoLink url={sapoCategoryUrl(category.sapoId)} label="Sapo" />
        </div>
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">
            {hasChildren ? subtreeCount : ownCount}
            <span className="sr-only">
              {hasChildren
                ? ` products in ${category.name} and everything under it`
                : " products"}
            </span>
          </Badge>
          {/* Every top-level group here holds nothing directly, so the two
              numbers are shown apart rather than one standing for both. */}
          {hasChildren && ownCount !== subtreeCount && (
            <span className="text-xs text-muted-foreground">
              {ownCount} direct
            </span>
          )}
        </div>
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
  links,
}: {
  readonly categories: readonly CategoryWithCount[];
  readonly links: readonly CategoryLink[];
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const [filter, setFilter] = useState("");

  // React Compiler memoises this; a hand-written useMemo would be redundant.
  // The forest is built only to be flattened: it is what knows a category's
  // depth-first position, its distinct subtree count and whether it has
  // children, none of which the raw list carries.
  const paths = categoryPaths(categories);
  const all: readonly FlatCategory[] = flattenForest(
    buildCategoryForest(categories, links),
  ).map((node) => ({
    category: node.category,
    path: paths.get(node.category.id) ?? [],
    hasChildren: node.children.length > 0,
    ownCount: node.ownCount,
    subtreeCount: node.subtreeCount,
  }));

  // Folded the way search folds everywhere else in this app, so `quat` finds
  // `Quạt` — `LOWER()` is ASCII-only and this comparison is the same one
  // `lib/search-text.ts` makes on the server.
  const term = foldForSearch(filter);
  const rows =
    term === ""
      ? all
      : all.filter(
          (row) =>
            foldForSearch(row.category.name).includes(term) ||
            foldForSearch(row.path.join(" ")).includes(term),
        );

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

      {/* Replaces "Expand all" — with no tree to open, 211 flat rows need a
          way to narrow rather than a way to unfold. */}
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter categories"
        aria-label="Filter categories"
        className="max-w-xs"
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden md:table-cell">In</TableHead>
              <TableHead className="hidden sm:table-cell">Slug</TableHead>
              <TableHead>Products</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-sm text-muted-foreground"
                >
                  {categories.length === 0
                    ? "No categories yet. Add one above."
                    : `Nothing matches “${filter}”.`}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <CategoryRow
                  key={row.category.id}
                  row={row}
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

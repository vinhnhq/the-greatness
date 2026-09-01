"use client";

/**
 * Categories: create, rename in place, delete — rendered as the tree Sapo
 * cannot store.
 *
 * The hierarchy comes from `categories.parentId`, seeded from a
 * reconstruction of the storefront menu (`lib/sapo-tree.ts`). Sapo's own
 * admin renders these 211 rows dead flat, with a child four rows above its
 * parent and no indentation, so the tree here is the point of the page rather
 * than decoration.
 *
 * **Roots start open and leaves start closed.** All-collapsed shows six rows
 * and hides the catalogue; all-expanded is the 211-row wall this replaces.
 * One level down is 47 rows — the shape of the taxonomy, at a glance.
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

import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
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
import type { CategoryLink, CategoryNode } from "@/lib/domain/categories/tree";
import { buildCategoryForest } from "@/lib/domain/categories/tree";
import { sapoCategoryUrl } from "@/lib/sapo";
import { cn } from "@/lib/utils";

import { createCategory, deleteCategory, renameCategory } from "./actions";

function CategoryRow({
  node,
  expanded,
  onToggle,
  busyId,
  onRename,
  onDelete,
}: {
  readonly node: CategoryNode<CategoryWithCount>;
  readonly expanded: boolean;
  readonly onToggle: (id: string) => void;
  readonly busyId: string | null;
  readonly onRename: (id: string, name: string) => void;
  readonly onDelete: (id: string) => void;
}) {
  const category = node.category;
  const hasChildren = node.children.length > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(category.name);
  // Per row and per action, so renaming one category does not freeze the
  // delete button on another.
  const busy = busyId === category.id;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-1">
          {/* An indent rail per level. With the row rules gone this is what
              carries depth — and it does it better, because depth is vertical
              information and a line *under* a row never expressed it. */}
          {Array.from({ length: node.depth }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className="mr-1 h-9 w-px shrink-0 self-stretch bg-border/70"
            />
          ))}
          {hasChildren ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              onClick={() => onToggle(category.id)}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${category.name}`}
            >
              {expanded ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </Button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}
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
            {hasChildren ? node.subtreeCount : node.ownCount}
            <span className="sr-only">
              {hasChildren
                ? ` products in ${category.name} and everything under it`
                : " products"}
            </span>
          </Badge>
          {/* Every top-level group here holds nothing directly, so the two
              numbers are shown apart rather than one standing for both. */}
          {hasChildren && node.ownCount !== node.subtreeCount && (
            <span className="text-xs text-muted-foreground">
              {node.ownCount} direct
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

  // React Compiler memoises this; a hand-written useMemo would be redundant.
  const forest = buildCategoryForest(categories, links);

  // Roots open, everything below closed — see the note at the top of the file.
  // Seeded once from the first render's roots; a category added later is a
  // leaf, which has nothing to expand.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(forest.map((n) => n.category.id)),
  );

  const toggle = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Depth-first, stopping wherever a node is closed. */
  const visible = (
    nodes: readonly CategoryNode<CategoryWithCount>[],
  ): readonly CategoryNode<CategoryWithCount>[] =>
    nodes.flatMap((node) =>
      expanded.has(node.category.id)
        ? [node, ...visible(node.children)]
        : [node],
    );

  const rows = visible(forest);
  const allOpen = rows.length === categories.length;

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

        <Button
          type="button"
          variant="outline"
          className="ms-auto"
          onClick={() =>
            setExpanded(
              allOpen
                ? new Set(forest.map((n) => n.category.id))
                : new Set(categories.map((c) => c.id)),
            )
          }
        >
          {allOpen ? "Collapse to groups" : "Expand all"}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Slug</TableHead>
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
              rows.map((node) => (
                <CategoryRow
                  key={node.category.id}
                  node={node}
                  expanded={expanded.has(node.category.id)}
                  onToggle={toggle}
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

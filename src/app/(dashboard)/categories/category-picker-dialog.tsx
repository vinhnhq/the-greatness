"use client";

/**
 * "Move to…" and "File in…": a searchable list of all 211 categories.
 *
 * **This is what replaces drag on a long list.** Dragging needs the source and
 * the target on screen at the same moment; with 211 categories at depth three
 * and 697 unfiled products that is often impossible on a 13-inch screen, and
 * it is impossible on touch. Here you type three letters and press Enter.
 *
 * Every row carries its full path, because "Quạt đứng" is one of nine
 * near-identical fan names and its ancestors are the only thing that tells
 * them apart. `cmdk` searches that value, so the path is searchable too —
 * typing a parent's name narrows to its children — and the matcher is
 * `foldForSearch`, so `quat thap` finds `Quạt tháp`.
 *
 * **Illegal targets are absent, not disabled.** `planMove` already knows which
 * they are: a category's own subtree, and where it already sits. A disabled
 * row in a list of 211 is noise; the pure function is the single place that
 * decision lives, and this asks it rather than re-deriving it.
 */

import { Check } from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { TreeCategory } from "@/lib/domain/categories/tree";
import { categoryPaths, planMove } from "@/lib/domain/categories/tree";
import { foldForSearch } from "@/lib/search-text";

export type PickerTarget =
  /** Re-parent a category. Its own subtree is not offered. */
  | { readonly kind: "move"; readonly id: string; readonly name: string }
  /** File a product. Categories it is already in are marked, not hidden. */
  | {
      readonly kind: "file";
      readonly id: string;
      readonly name: string;
      readonly alreadyIn: readonly string[];
    };

export function CategoryPickerDialog<T extends TreeCategory>({
  target,
  categories,
  onPick,
  onOpenChange,
}: {
  /** Null closes it. */
  readonly target: PickerTarget | null;
  readonly categories: readonly T[];
  readonly onPick: (categoryId: string | null) => void;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const paths = categoryPaths(categories);

  const rows =
    target === null
      ? []
      : categories.flatMap((category) => {
          if (target.kind === "move") {
            // Asking `planMove` rather than re-deriving the cycle rule: it is
            // the one place that decision is written down, and it is tested.
            if (!planMove(categories, target.id, category.id).ok) return [];
          }
          const path = paths.get(category.id) ?? [];
          return [
            {
              id: category.id,
              name: category.name,
              path,
              // `cmdk` matches on this, so an ancestor's name finds its
              // children.
              value: [...path, category.name].join(" › "),
              already:
                target.kind === "file" &&
                target.alreadyIn.includes(category.id),
            },
          ];
        });

  const canMoveToTop =
    target !== null &&
    target.kind === "move" &&
    planMove(categories, target.id, null).ok;

  return (
    <CommandDialog
      open={target !== null}
      onOpenChange={onOpenChange}
      // cmdk's default matcher does not fold Vietnamese diacritics, so `quat
      // thap` found nothing. This is the same fold the tree filter, the
      // product picker and the SQL `searchText` column all use — one place
      // decides what "matches" means.
      filter={(value, search) =>
        foldForSearch(value).includes(foldForSearch(search)) ? 1 : 0
      }
      title={target?.kind === "file" ? "File in…" : "Move to…"}
      description={
        target === null
          ? ""
          : target.kind === "file"
            ? `Choose a category for ${target.name}.`
            : `Choose a new parent for ${target.name}.`
      }
    >
      <CommandInput placeholder="Search categories…" />
      <CommandList>
        <CommandEmpty>No category matches.</CommandEmpty>

        {canMoveToTop && (
          <CommandGroup>
            <CommandItem value="Top level" onSelect={() => onPick(null)}>
              Top level
            </CommandItem>
          </CommandGroup>
        )}

        <CommandGroup>
          {rows.map((row) => (
            <CommandItem
              key={row.id}
              value={row.value}
              onSelect={() => onPick(row.id)}
            >
              <span className="min-w-0 flex-1 truncate">
                {row.path.length > 0 && (
                  <span className="text-muted-foreground">
                    {row.path.join(" › ")} ›{" "}
                  </span>
                )}
                {row.name}
              </span>
              {/* Already-in is marked rather than hidden: seeing where a
                  product already sits is half of deciding where it goes. */}
              {row.already && (
                <Check className="size-4 shrink-0 text-muted-foreground" />
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

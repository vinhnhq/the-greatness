"use client";

/**
 * The taxonomy: the whole catalogue as one tree, and what is selected beside
 * it.
 *
 * **Products are leaves.** An editor's file tree is the model — a prefix icon,
 * not a thumbnail, because the tree carries all 832 products at once and a
 * thumbnail here would fetch 786 assets to render a 16px glyph. The picture
 * belongs in the pane on the right.
 *
 * **Unfiled is part of the structure, not an omission.** 697 of 832 products
 * are in no category and 191 of 211 categories are empty, so a tree of only
 * filed products is a view of a sixth of the shop. Unfiled is a computed
 * node: it cannot be renamed, deleted, or dropped onto.
 *
 * **It caps rather than virtualises.** 697 rows under one node is real, but an
 * unmounted row is not a drop target — and Unfiled is exactly where dropping
 * happens. So the node shows the first `UNFILED_CAP` and the filter box is how
 * you reach the rest. Filtering searches names *and* SKUs, over categories and
 * products at once.
 *
 * **Selection lives in the URL** (`?category=<slug>`), not in state, so a
 * branch is still linkable and survives a reload. `/categories/[slug]` stays
 * as the deep view; this is the one for moving around.
 *
 * **Dragging re-parents; it does not reorder.** Siblings sort by name at every
 * level, so a drop has no position to express — see `planMove`. Dropping a
 * category on another makes it a child; dropping a product on a category files
 * it there.
 *
 * `@dnd-kit`, which this project already uses for media ordering and which is
 * already proven under React 19 here. No second drag engine. A draggable id
 * carries the category it is being dragged *from*, because the same product
 * legitimately appears under as many as eleven of them.
 */

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Folder,
  FolderOpen,
  FolderInput,
  FolderPlus,
  GripVertical,
  Inbox,
  Package,
  PanelRightOpen,
  Search,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import type { CategoryWithCount } from "@/lib/domain/categories/repository";
import type {
  GroupedProducts,
  TreeProduct,
} from "@/lib/domain/categories/taxonomy";
import {
  filterTaxonomy,
  groupProducts,
} from "@/lib/domain/categories/taxonomy";
import type { CategoryLink, CategoryNode } from "@/lib/domain/categories/tree";
import { buildCategoryForest } from "@/lib/domain/categories/tree";
import { sapoCategoryUrl } from "@/lib/sapo";
import { cn } from "@/lib/utils";

import {
  assignCategory,
  assignCategoryMany,
  createCategory,
  deleteCategory,
  moveCategory,
  unassignCategory,
} from "./actions";
import type { PickerTarget } from "./category-picker-dialog";
import { CategoryPickerDialog } from "./category-picker-dialog";
import { DetailPane } from "./detail-pane";
import { DeleteCategoryDialog, NewChildDialog } from "./row-dialogs";
import type { MenuAction } from "./row-menu";
import { RowMenu, RowMenuButton } from "./row-menu";

/**
 * How many unfiled products render before the filter has to do the work.
 * Not virtualisation: an off-screen row is not a drop target, and this node is
 * where dropping happens.
 */
const UNFILED_CAP = 100;

/** The key Unfiled answers to in expansion state. Not a category id. */
const UNFILED = " unfiled";

type DragPayload =
  | { readonly kind: "category"; readonly id: string; readonly name: string }
  | {
      readonly kind: "product";
      readonly id: string;
      readonly name: string;
      /** Null when dragged out of Unfiled. What "remove from here" needs. */
      readonly fromCategoryId: string | null;
    };

/**
 * Everything a row can ask the workspace to do, in one object.
 *
 * Threaded rather than put in a context: the tree is four components deep and
 * every one of them already takes the node it renders, so one more prop is
 * cheaper than a provider — and seven separate callbacks is what this replaces.
 */
type RowActions = {
  readonly toggle: (id: string) => void;
  readonly selectCategory: (slug: string) => void;
  readonly openProduct: (id: string) => void;
  /** Opens the picker for a category's new parent. */
  readonly moveCategory: (id: string, name: string) => void;
  /** Opens the picker for a product's next category. */
  readonly fileProduct: (id: string, name: string) => void;
  readonly unfileProduct: (
    productId: string,
    categoryId: string,
    name: string,
  ) => void;
  readonly addChild: (parentId: string, parentName: string) => void;
  readonly removeCategory: (id: string, name: string, count: number) => void;
  readonly toggleSelected: (productId: string) => void;
  /** Product ids ticked for a bulk file. Empty means nothing is selected. */
  readonly selected: ReadonlySet<string>;
};

/** The rails that carry depth. */
function Rails({ depth }: { readonly depth: number }) {
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          aria-hidden
          // Deliberately no height: `h-7` and `self-stretch` fight, because
          // align-self only stretches an auto height, and the rail then stops
          // short of a taller row. Stretched, consecutive rails meet.
          className="ml-1 w-px shrink-0 self-stretch bg-border/70"
        />
      ))}
    </>
  );
}

function ProductRow({
  product,
  depth,
  fromCategoryId,
  actions,
  dragging,
}: {
  readonly product: TreeProduct;
  readonly depth: number;
  readonly fromCategoryId: string | null;
  readonly actions: RowActions;
  readonly dragging: DragPayload | null;
}) {
  // Scoped by the category it hangs under: the same product appears under as
  // many as eleven, and dnd-kit needs each draggable id to be distinct.
  const {
    attributes,
    listeners,
    setNodeRef: dragRef,
  } = useDraggable({
    id: `product:${fromCategoryId ?? "unfiled"}:${product.id}`,
    data: {
      kind: "product",
      id: product.id,
      name: product.name,
      fromCategoryId,
    },
  });

  const isDragging =
    dragging?.kind === "product" &&
    dragging.id === product.id &&
    dragging.fromCategoryId === fromCategoryId;

  const menu: readonly MenuAction[] = [
    {
      label: "Open",
      icon: PanelRightOpen,
      onSelect: () => actions.openProduct(product.id),
    },
    {
      label: "File in\u2026",
      icon: FolderInput,
      onSelect: () => actions.fileProduct(product.id, product.name),
    },
    // Only where it hangs off a category. In Unfiled there is nothing to
    // remove it from, and the item would be a dead entry on 697 rows.
    ...(fromCategoryId === null
      ? []
      : [
          {
            label: "Remove from this category",
            icon: Unlink,
            separated: true,
            onSelect: () =>
              actions.unfileProduct(product.id, fromCategoryId, product.name),
          },
        ]),
  ];

  return (
    <li>
      <RowMenu actions={menu}>
        <div
          className={cn(
            "flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-muted/40",
            isDragging && "opacity-40",
          )}
        >
          <Rails depth={depth} />

          {/* Occupies the slot a chevron would use on a category. Hidden
              until the tree is hovered, then pinned once anything is ticked —
              a checkbox that disappears mid-selection is worse than one that
              is always there. */}
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center transition-opacity",
              actions.selected.size === 0 &&
                "opacity-0 group-hover/tree:opacity-100 focus-within:opacity-100",
            )}
          >
            <Checkbox
              checked={actions.selected.has(product.id)}
              onCheckedChange={() => actions.toggleSelected(product.id)}
              aria-label={`Select ${product.name}`}
            />
          </span>

          <Package
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground",
              product.status === "draft" && "opacity-50",
            )}
            aria-hidden
          />

          <button
            type="button"
            onClick={() => actions.openProduct(product.id)}
            className="min-w-0 flex-1 truncate rounded-sm py-2 text-left text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            {product.name}
          </button>

          {product.sku !== null && (
            <code className="hidden shrink-0 font-mono text-[11px] text-muted-foreground/70 sm:block">
              {product.sku}
            </code>
          )}

          <span
            ref={dragRef}
            {...listeners}
            {...attributes}
            className="shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover/tree:opacity-100 hover:text-foreground"
            aria-label={`Move ${product.name}`}
          >
            <GripVertical className="size-4" aria-hidden />
          </span>

          <RowMenuButton label={product.name} actions={menu} />
        </div>
      </RowMenu>
    </li>
  );
}

function TreeRow({
  node,
  grouped,
  selected,
  expanded,
  actions,
  dragging,
}: {
  readonly node: CategoryNode<CategoryWithCount>;
  readonly grouped: GroupedProducts;
  readonly selected: string | null;
  readonly expanded: ReadonlySet<string>;
  readonly actions: RowActions;
  readonly dragging: DragPayload | null;
}) {
  const category = node.category;
  const products = grouped.byCategory.get(category.id) ?? [];
  // A category with products but no child categories still opens.
  const hasContents = node.children.length > 0 || products.length > 0;
  const isOpen = expanded.has(category.id);

  const {
    attributes,
    listeners,
    setNodeRef: dragRef,
  } = useDraggable({
    id: `category:${category.id}`,
    data: { kind: "category", id: category.id, name: category.name },
  });
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `drop:${category.id}`,
    data: { categoryId: category.id },
  });

  // Its own subtree is never a legal target; dimming it says so before the
  // drop is attempted rather than as an error afterwards.
  const isSelf = dragging?.kind === "category" && dragging.id === category.id;

  const menu: readonly MenuAction[] = [
    {
      label: "Move to\u2026",
      icon: FolderInput,
      onSelect: () => actions.moveCategory(category.id, category.name),
    },
    {
      label: "Add a subcategory",
      icon: FolderPlus,
      onSelect: () => actions.addChild(category.id, category.name),
    },
    ...(category.sapoId === null
      ? []
      : [
          {
            label: "Open in Sapo",
            icon: ExternalLink,
            separated: true,
            onSelect: () => {
              const url = sapoCategoryUrl(category.sapoId);
              if (url !== null) window.open(url, "_blank", "noopener");
            },
          },
        ]),
    {
      label: "Delete\u2026",
      icon: Trash2,
      destructive: true,
      separated: true,
      onSelect: () =>
        actions.removeCategory(
          category.id,
          category.name,
          category.productCount,
        ),
    },
  ];

  return (
    <li>
      <RowMenu actions={menu}>
        <div
          ref={dropRef}
          className={cn(
            "flex items-center gap-1 rounded-md pr-1 transition-colors",
            // `ring-inset`, not a bare ring. A Tailwind ring is an *outer*
            // box-shadow, and these rows sit flush against each other — so the
            // drop highlight on one row was painted over its neighbour above
            // and below. Inset keeps it inside the row it describes.
            isOver &&
              !isSelf &&
              "bg-primary/10 ring-1 ring-primary/40 ring-inset",
            isSelf && "opacity-40",
            selected === category.slug && "bg-muted",
          )}
        >
          <Rails depth={node.depth} />

          {hasContents ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              onClick={() => actions.toggle(category.id)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? "Collapse" : "Expand"} ${category.name}`}
            >
              {isOpen ? (
                <ChevronDown className="size-4" aria-hidden />
              ) : (
                <ChevronRight className="size-4" aria-hidden />
              )}
            </Button>
          ) : (
            <span className="size-6 shrink-0" aria-hidden />
          )}

          {isOpen && hasContents ? (
            <FolderOpen
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <Folder
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}

          <button
            type="button"
            onClick={() => actions.selectCategory(category.slug)}
            className="min-w-0 flex-1 truncate rounded-sm py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
          >
            <span className={node.children.length > 0 ? "font-medium" : ""}>
              {category.name}
            </span>
          </button>

          {node.subtreeCount > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {node.subtreeCount}
            </Badge>
          )}

          <span
            ref={dragRef}
            {...listeners}
            {...attributes}
            className="shrink-0 cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover/tree:opacity-100 hover:text-foreground"
            aria-label={`Move ${category.name}`}
          >
            <GripVertical className="size-4" aria-hidden />
          </span>

          <RowMenuButton label={category.name} actions={menu} />
        </div>
      </RowMenu>

      {hasContents && isOpen && (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.category.id}
              node={child}
              grouped={grouped}
              selected={selected}
              expanded={expanded}
              actions={actions}
              dragging={dragging}
            />
          ))}
          {/* Products after subcategories: the structure reads top-down, and
              a group's own handful should not push its branches off screen. */}
          {products.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              depth={node.depth + 1}
              fromCategoryId={category.id}
              actions={actions}
              dragging={dragging}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The 697.
 *
 * A computed node, not a row: it has no id in the database, so it cannot be
 * renamed, deleted, or made a drop target. Dragging *out* of it is the point.
 */
function UnfiledNode({
  products,
  expanded,
  actions,
  dragging,
}: {
  readonly products: readonly TreeProduct[];
  readonly expanded: boolean;
  readonly actions: RowActions;
  readonly dragging: DragPayload | null;
}) {
  if (products.length === 0) return null;

  const shown = products.slice(0, UNFILED_CAP);
  const hidden = products.length - shown.length;

  return (
    <li>
      <div className="flex items-center gap-1 rounded-md pr-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 shrink-0"
          onClick={() => actions.toggle(UNFILED)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} Unfiled`}
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
        </Button>

        <Inbox className="size-3.5 shrink-0 text-warning" aria-hidden />

        <span className="min-w-0 flex-1 truncate py-2 text-sm font-medium">
          Unfiled
        </span>

        {/* The one amber mark in the tree, and deliberately **one**: 697 of
            832 products are unfiled, so an amber row per product would colour
            84% of the catalogue and mean nothing. Aggregate the majority,
            mark the minority. The number is beside it, so the badge still
            reads with colour removed. */}
        <Badge
          variant="secondary"
          className="shrink-0 border-transparent bg-warning/15 text-warning tabular-nums"
        >
          {products.length}
        </Badge>
        <span className="size-4 shrink-0" aria-hidden />
      </div>

      {expanded && (
        <ul>
          {shown.map((product) => (
            <ProductRow
              key={product.id}
              product={product}
              depth={1}
              fromCategoryId={null}
              actions={actions}
              dragging={dragging}
            />
          ))}
          {hidden > 0 && (
            <li className="py-2 pl-8 text-xs text-muted-foreground">
              {hidden} more — filter to narrow.
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function CategoryWorkspace({
  categories,
  links,
  products,
  contents,
}: {
  readonly categories: readonly CategoryWithCount[];
  readonly links: readonly CategoryLink[];
  readonly products: readonly TreeProduct[];
  readonly contents: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("category");
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [term, setTerm] = useState("");
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [newChild, setNewChild] = useState<{
    parentId: string;
    parentName: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
    count: number;
  } | null>(null);
  // Product ids, so ticking a product ticks it everywhere it appears — it is
  // the product being filed, not one of its eleven rows. Named `picked` and
  // not `selected`: that word already means the selected category's slug.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  // The move shows immediately and is reconciled when the action returns; a
  // rejected move simply never lands, because the optimistic value is dropped
  // when the transition ends.
  const [optimistic, applyOptimistic] = useOptimistic(
    categories,
    (current, move: { id: string; parentId: string | null }) =>
      current.map((c) =>
        c.id === move.id
          ? { ...c, parentId: move.parentId as CategoryWithCount["parentId"] }
          : c,
      ),
  );

  // React Compiler memoises all of this; a hand-written useMemo is redundant.
  const whole = buildCategoryForest(optimistic, links);
  const wholeGrouped = groupProducts(products, links);
  const { forest, grouped } = filterTaxonomy(whole, wholeGrouped, term);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(whole.map((n) => n.category.id)),
  );

  // A filtered tree is opened all the way: hiding a match behind a closed
  // branch is the one thing a search must never do.
  const searching = term.trim() !== "";
  const openAll = (
    nodes: readonly CategoryNode<CategoryWithCount>[],
  ): readonly string[] =>
    nodes.flatMap((n) => [n.category.id, ...openAll(n.children)]);
  const effectiveExpanded = searching
    ? new Set([...openAll(forest), UNFILED])
    : expanded;

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** One writer for both selections, so they cannot both be set at once. */
  const selectInto = (key: "category" | "product", value: string | null) => {
    const next = new URLSearchParams(params);
    next.delete("category");
    next.delete("product");
    if (value !== null) next.set(key, value);
    const query = next.toString();
    router.replace(query === "" ? "/categories" : `/categories?${query}`, {
      scroll: false,
    });
  };

  const select = (slug: string) => selectInto("category", slug);
  const openProduct = (id: string) => selectInto("product", id);
  const closeDetail = () => selectInto("category", null);

  /** The categories each product is already in — what the picker ticks. */
  const categoriesOfProduct = (productId: string): readonly string[] =>
    links.flatMap((l) => (l.productId === productId ? [l.categoryId] : []));

  const run = (
    work: () => Promise<
      { status: "ok" } | { status: "error"; message: string }
    >,
    success: string,
  ) =>
    startTransition(async () => {
      const result = await work();
      if (result.status === "error") toast.error(result.message);
      else toast.success(success);
    });

  const pick = (categoryId: string | null) => {
    const target = picker;
    setPicker(null);
    if (target === null) return;

    if (target.kind === "fileMany") {
      if (categoryId === null) return;
      const ids = [...picked];
      startTransition(async () => {
        const result = await assignCategoryMany(ids, categoryId);
        if (result.status === "error") {
          toast.error(result.message);
          return;
        }
        setPicked(new Set());
        const filed = result.filed ?? 0;
        toast.success(
          filed === ids.length
            ? `Filed ${filed} product${filed === 1 ? "" : "s"}.`
            : `Filed ${filed} of ${ids.length} — the rest were already there.`,
        );
      });
      return;
    }

    if (target.kind === "move") {
      // Optimistic, like the drag: the row moves at once and a refused move
      // simply never lands, because the optimistic value is dropped when the
      // transition ends.
      startTransition(async () => {
        applyOptimistic({ id: target.id, parentId: categoryId });
        const result = await moveCategory(target.id, categoryId);
        if (result.status === "error") toast.error(result.message);
        else toast.success(`Moved ${target.name}.`);
      });
      return;
    }

    if (categoryId === null) return;
    run(() => assignCategory(target.id, categoryId), `Filed ${target.name}.`);
  };

  const actions: RowActions = {
    toggle,
    selectCategory: select,
    openProduct,
    moveCategory: (id, name) => setPicker({ kind: "move", id, name }),
    fileProduct: (id, name) =>
      setPicker({
        kind: "file",
        id,
        name,
        alreadyIn: categoriesOfProduct(id),
      }),
    unfileProduct: (productId, categoryId, name) =>
      run(
        () => unassignCategory(productId, categoryId),
        `Removed ${name} from that category.`,
      ),
    addChild: (parentId, parentName) => setNewChild({ parentId, parentName }),
    removeCategory: (id, name, count) => setConfirmDelete({ id, name, count }),
    selected: picked,
    toggleSelected: (productId) =>
      setPicked((current) => {
        const next = new Set(current);
        if (next.has(productId)) next.delete(productId);
        else next.add(productId);
        return next;
      }),
  };

  const sensors = useSensors(
    // A little distance, or every click on a row starts a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const payload = event.active.data.current as DragPayload | undefined;
    const targetId = (event.over?.data.current as { categoryId?: string })
      ?.categoryId;
    if (payload === undefined || targetId === undefined) return;

    startTransition(async () => {
      if (payload.kind === "category") {
        applyOptimistic({ id: payload.id, parentId: targetId });
        const result = await moveCategory(payload.id, targetId);
        if (result.status === "error") toast.error(result.message);
      } else {
        const result = await assignCategory(payload.id, targetId);
        if (result.status === "error") toast.error(result.message);
        else toast.success(`Filed ${payload.name}.`);
      }
    });
  };

  return (
    // A stable `id`, not dnd-kit's default: it mints one from a module-level
    // counter, so the server says `DndDescribedBy-0` and a client that has
    // already mounted another context says `DndDescribedBy-14`. That is a
    // real hydration mismatch on every render of this page.
    <DndContext
      id="taxonomy"
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragging(e.active.data.current as DragPayload)
      }
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(320px,440px)_1fr]">
        <div className="group/tree flex min-w-0 flex-col gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Filter categories and products"
              aria-label="Filter the taxonomy"
              className="pl-8"
            />
          </div>

          <div className="min-w-0 rounded-lg border p-2">
            <ul aria-label="Taxonomy" className="max-h-[70vh] overflow-y-auto">
              {forest.map((node) => (
                <TreeRow
                  key={node.category.id}
                  node={node}
                  grouped={grouped}
                  selected={selected}
                  expanded={effectiveExpanded}
                  actions={actions}
                  dragging={dragging}
                />
              ))}

              <UnfiledNode
                products={grouped.unfiled}
                expanded={effectiveExpanded.has(UNFILED)}
                actions={actions}
                dragging={dragging}
              />

              {forest.length === 0 && grouped.unfiled.length === 0 && (
                <li className="p-4 text-center text-sm text-muted-foreground">
                  Nothing matches &ldquo;{term}&rdquo;.
                </li>
              )}
            </ul>
          </div>
        </div>

        <DetailPane
          open={selected !== null || params.get("product") !== null}
          onClose={closeDetail}
        >
          {contents}
        </DetailPane>
      </div>

      <DragOverlay>
        {dragging && (
          <div className="rounded-md border bg-card px-3 py-1.5 text-sm shadow-lg">
            {dragging.name}
          </div>
        )}
      </DragOverlay>

      {/* The selection bar. Fixed, because the thing being selected is in a
          pane that scrolls, and a bar that scrolls away mid-selection is a
          bar you have to hunt for. */}
      {picked.size > 0 && (
        <div
          role="region"
          aria-label="Selection"
          className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit items-center gap-3 rounded-full border bg-card py-2 pr-2 pl-4 shadow-lg"
        >
          <span className="text-sm tabular-nums">{picked.size} selected</span>
          <Button
            type="button"
            size="sm"
            onClick={() => setPicker({ kind: "fileMany", count: picked.size })}
          >
            <FolderInput className="size-4" aria-hidden />
            File in…
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setPicked(new Set())}
            aria-label="Clear selection"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      )}

      <CategoryPickerDialog
        target={picker}
        categories={optimistic}
        onPick={pick}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
      />

      <NewChildDialog
        target={newChild}
        onClose={() => setNewChild(null)}
        onCreate={(parentId, name) =>
          run(() => createCategory(name, parentId), `Added ${name}.`)
        }
      />

      <DeleteCategoryDialog
        target={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={(id, name) =>
          run(() => deleteCategory(id), `Deleted ${name}.`)
        }
      />
    </DndContext>
  );
}

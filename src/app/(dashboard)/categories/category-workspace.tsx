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
  Folder,
  FolderOpen,
  GripVertical,
  Inbox,
  Package,
  Search,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";

import { assignCategory, moveCategory } from "./actions";
import { DetailPane } from "./detail-pane";

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
  onOpen,
  dragging,
}: {
  readonly product: TreeProduct;
  readonly depth: number;
  readonly fromCategoryId: string | null;
  readonly onOpen: (id: string) => void;
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

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md pr-2 transition-colors hover:bg-muted/40",
          isDragging && "opacity-40",
        )}
      >
        <Rails depth={depth} />
        <span className="size-6 shrink-0" aria-hidden />

        <Package
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground",
            product.status === "draft" && "opacity-50",
          )}
          aria-hidden
        />

        <button
          type="button"
          onClick={() => onOpen(product.id)}
          className="min-w-0 flex-1 truncate rounded-sm py-2 text-left text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
        >
          {product.name}
        </button>

        {product.sku !== null && (
          <code className="shrink-0 font-mono text-[11px] text-muted-foreground/70">
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
      </div>
    </li>
  );
}

function TreeRow({
  node,
  grouped,
  selected,
  expanded,
  onToggle,
  onSelect,
  onOpenProduct,
  dragging,
}: {
  readonly node: CategoryNode<CategoryWithCount>;
  readonly grouped: GroupedProducts;
  readonly selected: string | null;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly onSelect: (slug: string) => void;
  readonly onOpenProduct: (id: string) => void;
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

  return (
    <li>
      <div
        ref={dropRef}
        className={cn(
          "flex items-center gap-1 rounded-md pr-2 transition-colors",
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
            onClick={() => onToggle(category.id)}
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
          onClick={() => onSelect(category.slug)}
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
      </div>

      {hasContents && isOpen && (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.category.id}
              node={child}
              grouped={grouped}
              selected={selected}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              onOpenProduct={onOpenProduct}
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
              onOpen={onOpenProduct}
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
  onToggle,
  onOpenProduct,
  dragging,
}: {
  readonly products: readonly TreeProduct[];
  readonly expanded: boolean;
  readonly onToggle: (id: string) => void;
  readonly onOpenProduct: (id: string) => void;
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
          onClick={() => onToggle(UNFILED)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} Unfiled`}
        >
          {expanded ? (
            <ChevronDown className="size-4" aria-hidden />
          ) : (
            <ChevronRight className="size-4" aria-hidden />
          )}
        </Button>

        <Inbox
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden
        />

        <span className="min-w-0 flex-1 truncate py-2 text-sm font-medium">
          Unfiled
        </span>

        <Badge variant="secondary" className="shrink-0">
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
              onOpen={onOpenProduct}
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
                  onToggle={toggle}
                  onSelect={select}
                  onOpenProduct={openProduct}
                  dragging={dragging}
                />
              ))}

              <UnfiledNode
                products={grouped.unfiled}
                expanded={effectiveExpanded.has(UNFILED)}
                onToggle={toggle}
                onOpenProduct={openProduct}
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
    </DndContext>
  );
}

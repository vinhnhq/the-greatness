"use client";

/**
 * The split view: the tree on the left, what is in the selected category on
 * the right. No navigation — selecting fills the right pane.
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
 * already proven under React 19 here. No second drag engine, and no
 * virtualization: 211 nodes at depth 3 gains nothing from it, and an unmounted
 * row is not a drop target.
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
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CategoryWithCount } from "@/lib/domain/categories/repository";
import type { CategoryLink, CategoryNode } from "@/lib/domain/categories/tree";
import { buildCategoryForest } from "@/lib/domain/categories/tree";
import { cn } from "@/lib/utils";

import { assignCategory, moveCategory } from "./actions";

type DragPayload =
  | { readonly kind: "category"; readonly id: string; readonly name: string }
  | { readonly kind: "product"; readonly id: string; readonly name: string };

function TreeRow({
  node,
  selected,
  expanded,
  onToggle,
  onSelect,
  dragging,
}: {
  readonly node: CategoryNode<CategoryWithCount>;
  readonly selected: string | null;
  readonly expanded: ReadonlySet<string>;
  readonly onToggle: (id: string) => void;
  readonly onSelect: (slug: string) => void;
  readonly dragging: DragPayload | null;
}) {
  const category = node.category;
  const hasChildren = node.children.length > 0;
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
          isOver && !isSelf && "bg-primary/10 ring-1 ring-primary/40",
          isSelf && "opacity-40",
          selected === category.slug && "bg-muted",
        )}
      >
        {Array.from({ length: node.depth }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className="ml-1 h-7 w-px shrink-0 self-stretch bg-border/70"
          />
        ))}

        {hasChildren ? (
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

        <button
          type="button"
          onClick={() => onSelect(category.slug)}
          className="min-w-0 flex-1 truncate py-1.5 text-left text-sm"
        >
          <span className={hasChildren ? "font-medium" : ""}>
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

      {hasChildren && isOpen && (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.category.id}
              node={child}
              selected={selected}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              dragging={dragging}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CategoryWorkspace({
  categories,
  links,
  contents,
}: {
  readonly categories: readonly CategoryWithCount[];
  readonly links: readonly CategoryLink[];
  readonly contents: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const selected = params.get("category");
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<DragPayload | null>(null);

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

  const forest = buildCategoryForest(optimistic, links);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(forest.map((n) => n.category.id)),
  );

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const select = (slug: string) => {
    const next = new URLSearchParams(params);
    next.set("category", slug);
    router.replace(`/categories?${next.toString()}`, { scroll: false });
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
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) =>
        setDragging(e.active.data.current as DragPayload)
      }
      onDragCancel={() => setDragging(null)}
      onDragEnd={onDragEnd}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <div className="group/tree min-w-0 rounded-lg border p-2">
          <ul className="max-h-[70vh] overflow-y-auto">
            {forest.map((node) => (
              <TreeRow
                key={node.category.id}
                node={node}
                selected={selected}
                expanded={expanded}
                onToggle={toggle}
                onSelect={select}
                dragging={dragging}
              />
            ))}
          </ul>
        </div>

        <div className="min-w-0">{contents}</div>
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

"use client";

/**
 * The menu on a tree row, reachable two ways: right-click anywhere on the row,
 * or the `⋮` button at its end.
 *
 * **Both, deliberately.** Right-click is invisible — nobody discovers it on a
 * web page unless they already expect a file tree — and it does not exist on
 * touch at all. A visible affordance that opens the same menu costs one button
 * and makes the feature findable. The items are defined once and rendered into
 * whichever primitive fired.
 *
 * Radix ships context menus and dropdown menus as separate component families
 * with the same shape, so the items are a render prop over the pair rather
 * than a shared abstraction that would have to hide the difference.
 */

import { MoreVertical } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MenuAction = {
  readonly label: string;
  readonly onSelect: () => void;
  readonly icon?: React.ComponentType<{ className?: string }>;
  readonly destructive?: boolean;
  /** Draws a rule above this item. */
  readonly separated?: boolean;
};

/**
 * Wraps a row so right-clicking it opens `actions`, and renders the `⋮`
 * button that opens the same list.
 */
export function RowMenu({
  actions,
  children,
}: {
  readonly actions: readonly MenuAction[];
  readonly children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {actions.map((action) => (
          <Item
            key={action.label}
            action={action}
            Row={ContextMenuItem}
            Separator={ContextMenuSeparator}
          />
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/**
 * The `⋮` button. Separate from `RowMenu` so it can sit inside the row, and
 * the one of the pair that carries an accessible name — a context menu has no
 * trigger to name, which is exactly why it needs this one beside it.
 */
export function RowMenuButton({
  label,
  actions,
}: {
  readonly label: string;
  readonly actions: readonly MenuAction[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 shrink-0 opacity-0 transition-opacity group-hover/tree:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
          aria-label={`Actions for ${label}`}
          // The row's own click must not fire underneath the menu.
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {actions.map((action) => (
          <Item
            key={action.label}
            action={action}
            Row={DropdownMenuItem}
            Separator={DropdownMenuSeparator}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Item({
  action,
  Row,
  Separator,
}: {
  readonly action: MenuAction;
  readonly Row: React.ComponentType<{
    onSelect?: () => void;
    variant?: "default" | "destructive";
    children?: React.ReactNode;
  }>;
  readonly Separator: React.ComponentType;
}) {
  const Icon = action.icon;
  return (
    <>
      {action.separated === true && <Separator />}
      <Row
        onSelect={action.onSelect}
        variant={action.destructive === true ? "destructive" : "default"}
      >
        {Icon && <Icon className="size-4" />}
        {action.label}
      </Row>
    </>
  );
}

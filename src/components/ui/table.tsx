"use client";

/**
 * Borderless tables.
 *
 * No rule under every row. A line between each of 25 rows draws the eye to
 * the grid rather than to the data, and with a 211-row category tree it turns
 * the page into a ledger. Separation is carried by row height, a hover tint,
 * and a header that is set apart by weight and letter-spacing rather than by
 * a line.
 *
 * **What the header keeps.** One hairline under the header row only. It is
 * not decoration: it is the boundary between labels and data, and it is the
 * one place a rule says something the spacing cannot.
 *
 * Rows that need to express structure — the category tree's depth — do it
 * with an indent rail on the cell, not with horizontal rules, because depth
 * is vertical information and a line under a row was never carrying it.
 */

import * as React from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // No rule under the header either: the uppercase tracked label is
      // already not data, and the first zebra stripe starts the body.
      className={cn("[&_tr]:hover:bg-transparent", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      // Zebra instead of rules (k-studio's table rule, adopted here):
      // every other row tinted, so a wide table still scans without a line
      // under each row fragmenting it. Hover and selection sit on top.
      className={cn("[&_tr:nth-child(even)]:bg-zebra", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border/60 bg-muted/50 font-medium",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // Uppercase and tracked, so the header reads as a label without a
        // box around it.
        "h-10 px-3 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground uppercase [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        // Taller than it was: the row's own height is now what separates it
        // from the next one.
        "px-3 py-3.5 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};

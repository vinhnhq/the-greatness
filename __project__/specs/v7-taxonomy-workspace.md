# v7 — The taxonomy workspace, and the 697

**Status:** ✅ Shipped 2026-09-02, all six blocks. Follows
[v6](v6-two-versions.md). Ship facts and the six bugs the gates passed are in
[`done.md`](../done.md); what v7 deliberately left is `V7.24`–`V7.28`.

> Decided before writing: **keep `@dnd-kit`, add a menu beside it.** The
> alternative reviewed was
> [picknplace.js](https://jgthms.com/picknplace.js/) — a pick-then-scroll-then-place
> interaction whose _idea_ is right for a tree and whose _code_ cannot be used
> here. See [Why not pick-and-place](#why-not-pick-and-place).

## Goal

Make the catalogue's shape visible in one place, and make filing a product
into a category something an operator can do a hundred times in an afternoon
on a 13-inch laptop.

## The number this version is really about

```
832 products · 211 categories · 282 links

135 products are filed.  697 are not.          (84%)
 20 categories hold something.  191 are empty.  (91%)
one product sits in as many as 11 categories.
```

This is the real Sapo state, not an import gap —
[`data/sapo/README.md`](../../data/sapo/README.md) already established that the
admin's 1112 links minus the 832-row `Thuế 8%` tax rule is exactly 280, and
that "any UI built on this data has to look right with an empty category
column".

Three consequences run through every task below:

1. **A tree of categories-with-products shows 16% of the catalogue** unless
   something holds the rest. Hence the **Unfiled** node.
2. **Filing is the job.** Drag is a fine way to do it twice and a hopeless way
   to do it seven hundred times. The **Move to… / File in…** picker is the
   primary interaction of this version; drag is the shortcut for a visible
   neighbour.
3. **Most categories are empty**, so a tree that hides empty branches would
   hide 91% of the taxonomy. Empty is a legitimate, visible state — it is
   often exactly what the operator is looking for a home in.

## What ships

### A · Two tabs, and Categories goes flat

`/categories` gains `Tabs`, with `?tab=` in the URL for the same reason
`?category=` is there — linkable, survives a reload, and a colleague can be
sent the exact view.

| Tab            | What it is                                              |
| -------------- | ------------------------------------------------------- |
| **Taxonomy**   | The tree: categories, their products, Unfiled. Default. |
| **Categories** | The flat list, as Sapo shows it. The CRUD surface.      |

The tree moves _out_ of the Categories tab, which is a net deletion —
`categories-table.tsx` is 424 lines today and renders its own hierarchy. What
the flat list gains instead is a **Path** column (`Điện gia dụng › Nhà bếp ›
Nồi`), which is the one thing Sapo's own flat list cannot give you and which
`ancestorNames` already computes. A flat row stays identifiable without a
tree.

### B · Spacing, and the overlap

The selected/drop highlight uses `ring-1 ring-primary/40`. **A Tailwind ring
is an outer box-shadow**, so with rows at zero vertical gap one row's ring is
painted over its neighbour — the reported overlap. It becomes `ring-inset`,
and the indent guides move from `self-stretch` siblings (which fight the row's
`h-7`) to a single `absolute inset-y-0` layer.

Row height goes from ~28px to ~34px. VS Code uses 22px, but that is a
mouse-only surface; this one is dragged on and tapped.

Verified in the browser at **1280×800** — the small laptop this requirement
came from — and at 1440, in both themes.

### C · Products in the tree

One extra read for `id, name, sku, status` per product. **No media join**: VS
Code prefixes an icon, not a thumbnail, which keeps the row compact and the
payload near 80 KB for all 832 names. The photograph belongs in the drawer.

- Categories: `ChevronRight`/`ChevronDown` + `Folder`/`FolderOpen`.
- Products: `Package`, muted for a draft.
- **Unfiled**: a computed pseudo-root holding the 697. Not a category — it
  cannot be renamed, deleted, or dropped onto.

**A product in 11 categories appears 11 times, and that is correct.** React
keys become `${categoryId}:${productId}`, and it is why the row menu says
_Remove from this category_ and never _Delete_.

**The 697 render filter-first**: Unfiled shows the first 100 with its true
count, and a type-to-filter box scopes the whole tree through the existing
`filterForest`. No virtualization — an unmounted row is not a drop target, and
Unfiled is exactly where dropping happens.

### D · The detail drawer

`?product=<id>` in the URL, with the server rendering the detail into a slot —
the same pattern `contents` uses today, which keeps the repository out of the
browser bundle and lets `router.replace` update props without remounting the
tree (so expand state survives).

**A persistent right pane at `lg+`, a `Sheet` below it.** One content
component in two shells: the tree is already a split view, so an overlay on top
of it is redundant chrome on a wide screen — and a pane is unusable at 768px.

The content is a **quick edit**, not the whole `ProductForm`: name, slug, SKU,
price, status, memberships, a primary-image preview, and _Open full editor →_.
The media field and library picker want a full page, and a filing session
never touches them.

### E · The menu

Right-click on a row **and** a `⋮` button, opening the same menu. Both,
because right-click is undiscoverable and does not exist on touch.

| On a category                | On a product              |
| ---------------------------- | ------------------------- |
| Move to… · Move to top level | Open · File in…           |
| Rename · Add child           | Remove from this category |
| Open in Sapo · Delete        | Open in Sapo              |

**Move to… / File in…** opens a `Command` palette over all 211 categories,
each shown with its full path, with illegal targets already excluded by
`planMove` — which takes `(id, targetId)` and no coordinates, so it needs no
new validation and no new rules. Type three letters, press Enter.

Drag stays. It is already e2e-tested and it is the right tool for a short hop
between two rows you can both see.

### F · Bulk filing

Checkbox multi-select in the tree, then _File N products in…_ through the same
picker. This is backlog `L.6` promoted and scoped to filing only.

Not a convenience: with 697 unfiled, one at a time is not a workflow, and
without this the rest of v7 is a nicer way to do something that still takes a
week. The honest caveat is that a mis-aimed bulk file touches N rows and there
is still no ⌘Z — `V6.16`/`V6.18` remain the real answer, and until then the
confirmation names the count and the target.

## Why not pick-and-place

`picknplace.js` picks an item, then computes the drop target from
`window.scrollY` as the page scrolls beneath a fixed ghost. The insight is
genuinely good — on touch, drag competes with scroll, and this removes the
drag. For a tree it is better still, because drag requires source and target
to be on screen at the same moment and pick-and-place does not.

The implementation cannot be adopted:

- **Flat, single-list reorder.** `$list.children` → `indexOf` → `swapByIndex`
  → `sortDomByNewIndices`. No second container, no parent. Our only move _is_
  cross-container: `planMove` re-parents and never reorders, because siblings
  sort by name and a drop has no position to express.
- **`window.scrollY` never moves here.** The workspace scrolls inside a pane.
  The entire targeting mechanism is inert in this layout.
- **It reorders real DOM children** with a `DocumentFragment` append and
  injects clones into the list. React owns those children.
- **Keyboard is Enter/Esc only** — no arrow keys. You can confirm or cancel,
  but you cannot choose a target without scrolling, so it is not the
  accessibility win it appears to be.
- The author states it is a proof of concept. Not on npm, no licence file, no
  tests.

So **the interaction is adopted and the code is not**: the row menu's _Move
to…_ is pick-and-place with a searchable list standing in for the scroll.

## Out of scope

- Writing any of this to Sapo. `V6.15` is still ADR-gated (`0004`).
- Reordering siblings. Sort is by name at every level; changing that is a
  different decision.
- Undo. `V6.16` first.

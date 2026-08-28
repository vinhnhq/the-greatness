# v2 — Media becomes a library

**Status:** ✅ Shipped 2026-08-28 (`d0f363b`, `fc9a030`). Decision:
[ADR-0001](../decisions/0001-media-ownership.md) · [ADR-0002](../decisions/0002-archive-cap.md).
Ship facts in [`../done.md`](../done.md).

> Written after the fact, and labelled as such. v1's spec came first and the
> work followed it; this one was reconstructed from the request and the
> commits at the end of the same session. It is the intent as it actually
> stood, not a tidier version invented afterwards.

## Goal

Invert the ownership of media. In [v1](v1-product-dashboard.md) an attachment
belonged to exactly one product and could only be created from that product's
form. v2 makes media a **first-class library**; a product _links_ to assets in
it. Three things follow, and they are the whole feature:

1. Upload many files **in the gallery**, with no product in mind.
2. **Pick from the library** when editing a product.
3. Uploading from a product still puts the asset **in the library** — the
   product form becomes a shortcut into it, not a separate silo.

## Out of scope

- **Replacing a file in place.** Swapping a photograph still means uploading
  the new one and unlinking the old one on every product using it (backlog
  V2.9).
- **Paging or search in the library picker.** It loads one page and stops
  (V2.7). A real catalogue will show which of the two it needs.
- **Bulk attach from the gallery.** Selection mode deletes; "add these six to
  a product" needs a product picker that does not exist (V2.8).
- **Folders, tags or collections.** The kind tabs plus "unused" plus the
  per-product filter are the whole taxonomy.
- **Server-side derivation.** The browser still produces every variant
  (V2.11).

## Stories / AC

- **AC-1** _(schema)_ `media_assets` holds the file with **no owner**;
  `product_media` holds `(productId, mediaId, position)`. Migration 004
  backfills every existing attachment into both, keeping its id so paths
  already written to disk resolve, then drops `product_attachments`. The
  seeded catalogue survives — a migration that needs `db:reset` is a reset
  with extra steps.
- **AC-2** _(upload anywhere)_ The gallery accepts a multi-file drop with no
  product involved; the product form accepts one too, and anything uploaded
  there also appears in the library. Both go through **one** upload hook and
  **one** drop-zone component.
- **AC-3** _(pick from the library)_ The product form offers "Add from
  library": a multi-select dialog over the library, excluding what is already
  attached, capped at the product's remaining slots.
- **AC-4** _(unlink ≠ delete)_ Removing a file from a product unlinks it and
  leaves it in the library. Deleting a product deletes no files. The UI says
  both, because "Remove" on a photo grid reads as "delete" unless told
  otherwise.
- **AC-5** _(delete says what it breaks)_ Deleting from the library removes
  the asset **and every link to it**, and the confirmation names the products
  that will lose it first. A library that deletes silently is a trap.
- **AC-6** _(unused is answerable)_ An `Unused` filter and a per-tile badge.
  "What have I uploaded and not used yet" is a library's most-asked question
  and is unanswerable from the kind tabs alone.
- **AC-7** _(alt on the asset)_ `alt` moves onto the asset — it describes the
  picture, not the relationship — and is edited in the **full-screen viewer**,
  the one screen where the picture is actually visible.
- **AC-8** _(the ceiling fits a phone)_ Images up to **25 MB**. The v1 gate
  ran at 8 MB _in front of_ the optimizer, rejecting exactly the files it was
  built to handle. See [ADR-0002](../decisions/0002-archive-cap.md) for what
  the stored original then means.
- **AC-9** _(gates)_ `bun run lint` · `bunx tsc --noEmit` ·
  `bun run test:coverage` · `bun run build` green, plus an E2E round trip:
  upload in the gallery → attach to a product → still in the library → upload
  from a product → appears in the gallery.

## Non-functional

- **One query per screen.** The library page is one read plus one for the
  links; a product's media is one JOIN. Paging the assets and then looking up
  each one's product is sixty round-trips for one screen.
- **The purity boundary holds.** The grid is a client component, so the pure
  fold (`media/grouping.ts`) and the in-memory twin (`media/in-memory.ts`)
  live apart from the repository — importing one from the other drags
  `node:async_hooks` and the Neon driver into the browser bundle and fails the
  route's build outright. This happened twice; see [`../retro.md`](../retro.md).
- Coverage ≥ 90% on the pure layer, unchanged.

## Open questions

- **Orphan files.** Deleting from the library removes the row and its links
  but leaves the bytes. v2 makes this _more_ tractable, not worse: an asset
  with no row is now a clear definition of what a sweep may collect (backlog
  N.2).
- **How big should the library picker get before it needs search?** Deferred
  until a real catalogue answers it.

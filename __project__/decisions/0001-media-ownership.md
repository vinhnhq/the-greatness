# ADR-0001 — Media is a library; products link to it

**Status:** Accepted · 2026-08-28 · shipped in `d0f363b`
**Spec:** [v2-media-library](../specs/v2-media-library.md)
**Supersedes:** the implicit v1 model (`product_attachments.productId NOT NULL`)

## Context

v1 stored an attachment as a row owned by exactly one product, created only
from that product's form. That shape makes three ordinary things impossible
rather than merely awkward:

- uploading a batch before deciding what it is for,
- using one photograph on two products,
- having a library page at all — `/gallery` in v1.1 was a _view over products'
  attachments_, which is why its filters were phrased around products.

The request that forced the issue: upload and optimise several files in the
gallery, pick them up later at a product, and have a product's own uploads
show in the gallery too.

## Decision

Split the row in two.

- **`media_assets`** — the file. No owner. `alt` lives here.
- **`product_media`** — `(productId, mediaId, position)`, composite primary key.

`position` is on the **link**, not the asset: two products may show the same
photograph and order their galleries differently. `alt` is on the **asset**:
it describes the picture. If one photograph genuinely needs two descriptions
on two products, those are two pictures.

### Consequences, stated because they are the feature

| Action                       | Result                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Remove a file from a product | **Unlinks.** The file stays in the library.                                      |
| Delete a product             | Links go; **no file is deleted**.                                                |
| Delete from the library      | Asset **and every link** go. The confirmation names the affected products first. |
| Upload from a product        | Asset joins the library **and** links, in one step.                              |

## Alternatives considered

- **Keep ownership, add a "copy to another product" action.** Cheaper to
  build, and wrong: two rows for one photograph means two files in storage and
  two places to fix a bad crop.
- **Keep `product_attachments` and add a nullable `productId`.** One table,
  no join. It makes "unowned" a special case of "owned", so every query needs
  a null check and `position` has nowhere sensible to live for an asset used
  twice.
- **A `media_id` on `product_attachments`, keeping the old table as the link.**
  The same shape as the decision, with a name that would have lied about what
  the table holds.

## Migration

**004 backfills.** Every existing attachment becomes one asset plus one link,
**keeping its id**, so `/uploads/products/<productId>/<attachmentId>/…` paths
already written to disk keep resolving. New assets are filed under
`media/<id>/…`; both are just strings to the serving route.

`down` is honestly lossy and says so: an asset on two products becomes one row
(the old primary key has no room for the second), and an asset on none is
dropped entirely — the old schema has nowhere to put a file that belongs to
nobody. Rolling back a model change loses what only the new model could
express.

## Consequences for the code

- A **client component must not import a repository module.** `groupByMonth`
  and the in-memory twin live in their own files (`media/grouping.ts`,
  `media/in-memory.ts`) because importing them from `media/repository.ts`
  pulls `readContext` → `db.ts` → `node:async_hooks` into the browser bundle
  and fails the route's build.
- `setAttachments(id, rows)` became `setMedia(id, ids)`. Taking **ids** is
  what stops a product writing its own copy of an asset instead of linking.
- Storage keys moved from `products/<productId>/<attachmentId>/` to
  `media/<mediaId>/`. An asset with no owner cannot be filed under one, and one
  used by three products cannot live in three directories.

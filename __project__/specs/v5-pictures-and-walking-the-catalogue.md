# v5 — Sharper pictures, and a catalogue you can walk

**Status:** 📝 Draft, written 2026-09-01. Not started. Follows
[v4](v4-taxonomy-and-sync.md), whose blocks A–C shipped the same day.

> Four requests, grouped because three of them are the same request from
> different angles: the dashboard is now full of real data and the surfaces
> that were fine against eight fake products are not fine against 832 real
> ones. Every number below was measured on 2026-09-01, not estimated.

## Goal

Four things, in the order they pay off:

1. **Pictures that look like the source.** Serve the de-logoed original rather
   than a variant baked at upload time, and let the framework size it.
2. **A catalogue you can walk.** Root → group → category → the actual
   products, with counts at every step, so someone can check the whole
   taxonomy in one sitting instead of trusting it.
3. **A UI/UX pass** over the surfaces real data has stressed.
4. **Borderless tables**, as the app's table style.

## Out of scope

- **Re-cutting the watermark detector.** It works: 255 images de-logoed, 4
  marketing banners deliberately spared by the ring test. A scan of all 786
  stored originals found 22 top-right colour hits, and the ones inspected are
  **false positives** — Shopee and Kadeka banners whose orange-and-blue
  artwork happens to sit near the logo's blue, on rows whose `logoRemoved` is
  `false`, meaning the script correctly refused to touch them. v5 re-runs the
  existing detector against fresh originals; it does not change it.
- **Deleting the display variants.** They stay written and stored. This
  version changes what is _served_, which is one function; throwing the files
  away is irreversible and can follow once the new path has run for a while.
- **Editing the tree's shape.** Still `V4.18`/`V4.19`.
- **Anything written to Sapo.** Still `V4.17`, still needs an ADR.

## Stories / AC

### A · Pictures

The current state, measured: `mediaSrc()`
([`media/entity.ts:53`](../../src/lib/domain/media/entity.ts)) returns
`optimizedUrl ?? originUrl`, so every grid, table and picker renders the
**1600px q82 WebP**, and `products-table.tsx` passes `unoptimized` to
`next/image`, so nothing is derived at request time either.

- **AC-1** _(serve the origin)_ `mediaSrc()` returns the **archive copy** —
  the de-logoed original — for images. This is the whole of "persist without
  optimize": the bytes on disk are already the original, and the only reason
  they are not on screen is one `??`.
- **AC-2** _(size it at request time, not upload time)_ Drop `unoptimized` and
  let `next/image` derive per-breakpoint variants. **This is what makes AC-1
  affordable**, and it needs saying plainly: origins total **216.7 MB against
  19.4 MB** of display copies, so serving them raw would take a 60-tile
  gallery page from ~1.5 MB to ~17 MB. Deriving on demand keeps the wire small
  _and_ the archive pristine — strictly better than a variant frozen at
  upload, because a 40px table thumbnail and a full-screen view stop sharing
  one 1600px file.
- **AC-3** _(re-sync first)_ `fetch:sapo --images` and `prepare:sapo-media`
  re-run so the archive reflects today's CDN, then `sync:sapo` — not `seed`,
  which would wipe the tree v4 just built.
- **AC-4** _(measure the change, don't assume it)_ Record the same PSNR/SSIM
  and page-weight numbers after the switch. The current copies are not
  visibly bad — worst in the catalogue is **37.2 dB / 0.9338 SSIM**, median
  43.8 dB — so the honest claim is "the archive is strictly better and now
  free to serve", not "the old ones were broken". If page weight regresses,
  AC-2 is not working and that is the bug.
- **AC-5** _(the 153 that actually lost something)_ Only **153 of 786** origins
  exceeded the 1600px display cap; those are the ones where detail was
  genuinely discarded. They are the before/after worth showing.

### B · Walking the catalogue

`/categories` is an admin CRUD list that now renders a tree. What it cannot
do is get from a group to a product — and with **only 20 of 211 categories
non-empty**, whole branches (all of CÔNG NGHỆ & PHỤ KIỆN) are empty and there
is no way to see that except by reading zeros.

- **AC-6** _(drill down)_ `/categories/[slug]` shows one category: its
  ancestors as a breadcrumb, its child categories with counts, and **the
  products in it**. Clicking a child descends; clicking a product opens it.
- **AC-7** _(counts at every step)_ Each node shows products in it and
  distinct products beneath it, reusing `buildCategoryForest` — the counts
  must stay distinct, since eight fans in nine fan categories are eight.
- **AC-8** _(the whole system at a glance)_ The root view answers "is this
  taxonomy populated?" without clicking: an empty branch must read as
  deliberately empty, not as a loading failure.
- **AC-9** _(linkable)_ Every level is a URL, so a branch can be sent to
  someone. Consistent with `/products` keeping its filters in the URL.

### C · The UI/UX pass

Found while surveying the app at 1440px and 390px on 2026-09-01:

- **AC-10** _(the broken-image placeholder)_ **63 of 832 products have no
  image**, and the placeholder is lucide's `ImageOff` — a crossed-out image
  glyph that reads as _failed to load_ rather than _no photo_. It is the most
  common "error" on the products list and it is not an error.
- **AC-11** _(uneven rows)_ A product in three categories stacks its chips and
  makes the row twice as tall as its neighbours, so the list loses its rhythm.
- **AC-12** _(a real pass, not a list of two)_ Walk every route at both ends
  of the viewport range, in both themes, and fix what that finds. AC-10 and
  AC-11 are what a fifteen-minute survey produced; the task is the survey,
  not those two items.
- **AC-13** _(keyboard and contrast)_ Focus states and status-badge contrast
  are the quality bar's last unverified line — this is where `N.1` gets done
  rather than deferred again.

### D · Borderless tables

- **AC-14** `components/ui/table.tsx` drops its row rules (`border-b` on
  `TableRow`, `[&_tr]:border-b` on the header) in favour of separation by
  spacing and hover. One component, four consumers: products, categories,
  media, gallery.
- **AC-15** _(density survives)_ Removing rules from a 25-row table is easy;
  keeping it scannable is the work. Row height, hover, and header weight carry
  what the lines were carrying, and the tree view's indentation must still
  read without them.

## Non-functional

- **No migration.** Nothing here changes the schema.
- **The four gates** green per task.
- **Page weight is a gate for section A**, not a nice-to-have: record
  before/after for `/products` (25 rows) and `/gallery` (60 tiles).
- **The e2e suite covers the drill-down**, since it is a navigation feature
  and navigation is what e2e is for.

## Open questions

- **Does `next/image` optimize the local `/uploads/[...key]` route?** It is
  same-origin so it should need no `remotePatterns` entry, but the Blob driver
  already has one and the two paths must behave the same. **Verify before
  building on it** — AC-2 is the load-bearing assumption of the whole section.
- **Is `/categories/[slug]` the right home, or is this a separate `/catalogue`
  surface?** The CRUD page and the browse page want different affordances —
  rename/delete buttons are noise while browsing — and merging them may make
  both worse.
- **What does the drill-down do about a product in a parent _and_ a child?**
  Showing it at both levels is honest and repetitive; showing it only at the
  deepest is tidier and hides the double-filing that the fan data proves is
  common.
- **Does removing table rules hurt the 211-row category tree most?** That is
  the table where a row's depth matters, and rules are doing more work there
  than on a flat list. It may need to keep something the others do not.
- **Is 25 MB of upload still the right ceiling** once the archive is what gets
  served? The cap was set when the display copy absorbed the size.

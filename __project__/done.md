# Done — write-once ship history

> Newest at top: `YYYY-MM-DD · <sha> · <task id> <description>`.
> Cut the line out of [`backlog.md`](backlog.md); never keep-and-tick.

## v8 Block A — colour where the data varies · ✅ 2026-09-02

Spec: [`specs/v8-colour-and-publishing.md`](specs/v8-colour-and-publishing.md),
part one. Blocks B–D are not started.

The fault was never too little colour. It was colour on the one column with
no variance:

```
status:          832 of 832 products are "active"   ← the only coloured column
no category:     697                                ← grey
no description:  299                                ← grey
no price:        160                                ← grey
no image:         63                                ← grey
```

Twenty-five identical green pills per page, teaching the reader to skip the
column, while everything that varies looked the same as everything else.

- **`active` goes neutral.** It is the default, and colour marks a departure
  from the default. What is left — amber for a draft, muted for archived —
  now means "this one is not like the others", which is the only thing a
  status column is for.
- **`--info` is the one new token**, and it means **Sapo's side**. The app is
  a two-version model and nothing distinguished theirs from ours; one hue used
  only for that does it without a word of explanation. It is on `SapoLink` and
  on `/reconcile`'s "changed here" rule.
- **The minorities get marked, the majority gets aggregated.** A price of 0
  (160 of 832) and a missing photograph (63) are amber. Unfiled gets **one**
  amber badge saying `697` — not 697 amber rows, because 84% of the catalogue
  in amber is the no-variance mistake inverted.
- **`/reconcile`'s two sections stop looking identical.** They mean opposite
  things — one needs a person, the other needs nobody — and the amber rule
  only appears when there actually is a conflict. With none, it stays grey.

Colour is never the only signal: every mark sits beside a word or a number,
so every page still reads with colour removed.

- 2026-09-02 · `42e1ab0` · **V8.1–V8.5** The palette, the four marks, and
  verification at 1280×800 in both themes.

## v7 — The taxonomy workspace, and the 697 · ✅ 2026-09-02

Spec: [`specs/v7-taxonomy-workspace.md`](specs/v7-taxonomy-workspace.md).

The version began with a number rather than a feature: **697 of 832 products
are filed in no category, and 191 of 211 categories are empty.** Everything
else followed. A tree of only filed products shows a sixth of the shop, so
Unfiled is a node. Filing is the job, so a searchable picker — not drag — is
the primary way to do it. And nobody files 697 things one at a time, so the
selection bar is not a nicety.

- **The catalogue is one tree now.** Products hang off every category they
  belong to, VS Code style: a prefix icon, not a thumbnail, because the tree
  carries all 832 at once and a thumbnail would fetch 786 assets to draw a
  14px glyph. A product in eleven categories appears eleven times, which is
  correct, and is why its menu says _remove from this category_ and never
  _delete_.
- **Unfiled caps at 100 and says how many more**, rather than virtualising: an
  unmounted row is not a drop target and Unfiled is exactly where dropping
  happens. The filter is how you reach the rest — categories and products,
  names and SKUs, folded so `noi com` finds `Nồi cơm`.
- **"Move to…" / "File in…" is the point of the version.** Drag needs source
  and target on screen together, which at depth three with 211 categories is
  often impossible on a 13-inch screen and always impossible on touch. The
  picker asks `planMove` which targets are legal rather than re-deriving the
  rule, and omits them rather than disabling them. Drag stays for a short hop.
- **Two tabs.** The tree left the CRUD list, which went flat the way Sapo
  shows it and gained the one thing Sapo's own list cannot carry: a path
  column. `?tab=` moves by `window.history.replaceState`, not `router.replace`
  — there is no server data behind a tab, so a round-trip for a toggle would
  be waste. Net deletion from a 424-line file.
- **Verified with `sync:sapo --plan` after the gates**, which is the check the
  gates cannot make: a product filed here, then a dry run against the real
  211/832 — kept, not reverted. The merge sees a member we added and Sapo did
  not.

**Six bugs the four gates passed and something else caught.** Two by looking
at the page, four by an e2e query:

- The drop highlight was painted **over its neighbours**: a Tailwind ring is
  an outer box-shadow and these rows sit flush. `ring-inset`. The indent rails
  had a quieter version of the same — `h-7` and `self-stretch` fight, because
  align-self only stretches an auto height, so the rails read as dashes.
- **dnd-kit mints its context id from a module counter**, so the server said
  `DndDescribedBy-0` and the client `DndDescribedBy-14` — a hydration mismatch
  on every render of the page. Both contexts now carry a stable `id`.
- **`<Label>` with no `htmlFor` is decoration.** Every control in the detail
  pane had no accessible name until a query by role and name failed.
- **The generated `CommandDialog` omits its `<Command>` wrapper**, so
  `CommandInput` threw `Cannot read properties of undefined (reading
'subscribe')` on first render — nothing in the app had used it before. Its
  `DialogTitle` also sat outside `DialogContent`, where Radix's
  `aria-labelledby` cannot find it.
- **cmdk's matcher does not fold Vietnamese diacritics**, so `quat thap` found
  nothing in the picker. It now uses the same `foldForSearch` as everything
  else.
- **A React key warning at the RSC boundary.** The pane's content crosses into
  an array of siblings React validates; `ProductQuickEdit` had a key and
  `CategoryContents` did not.

Ship lines:

- 2026-09-02 · `1e75870` · **V7.1–V7.3** Tabs; the Categories tab goes flat
  with a path column; the tree leaves `categories-table.tsx`.
- 2026-09-02 · `793147f` · **V7.4–V7.6** The drop highlight stops overlapping;
  rows 30px → 36px; verified at 1280×800 in both themes.
- 2026-09-02 · `4b872f9` · **V7.7–V7.11** Products as tree leaves; the Unfiled
  node; filter-first over categories and products; `listForTree`.
- 2026-09-02 · `a15e8c2` · **V7.12–V7.15** `?product=`; a pane at `lg` and a
  drawer below it, one element rather than two; the quick edit.
- 2026-09-02 · `f0ff0c9` · **V7.16–V7.21** Right-click and `⋮`, the same menu;
  the "Move to…" picker; `unassignCategory`; `createCategory` takes a parent.
- 2026-09-02 · `7936194` · **V7.22–V7.23** Multi-select and bulk filing, with
  counts in the toast because "done" hides a half-applied selection.

## v6 — Two versions of the truth, reconciled on purpose · ✅ 2026-09-02

The sync stopped overwriting. `sapo_mirror` stores the payload Sapo gave us
last time, so every field is merged base/ours/theirs and the branch that never
existed — **we changed it and Sapo did not, so keep ours** — now does.

- **Not event-sourced, and the reasoning is written down** because it will be
  asked again. Sapo emits no events, so their side can only ever be derived by
  diffing a stored snapshot; the mirror is needed either way, and event
  sourcing would add a log beside it plus projections while relocating
  conflict policy into a replay function that is harder to test than a pure
  function of three values. `L.7` is re-pointed at `V6.16`.
- **Proven against the real 211/832**: rename a category, rename a product,
  drag that product into an imported category, run `sync:sapo` — all three
  survive, reported as "kept ours". Before this, all three were reverted.
- **A conflict is a row, not a modal.** The run applies the three automatic
  buckets and parks the fourth, so it never blocks and stays schedulable.
  Re-running re-evaluates: if Sapo comes back to our value the conflict heals
  and disappears.
- **`/reconcile`** shows two lists that mean opposite things — the small one
  needs a decision, the large one is what the mirror is protecting.
- **`sync:sapo --plan`** is a real run inside a rolled-back transaction, not a
  predictor that can drift from the thing it predicts.
- **A split `/categories`** with `@dnd-kit`: drag to re-parent, drag a product
  to file it, selection in the URL. No `react-arborist` (a second drag engine
  pinned to `react-dnd ^14` from 2022), no `react-window` (211 nodes at depth
  3, and an unmounted row is not a drop target).

Tasks: V6.1–V6.14. Commits `5f4e48b`, `670bba6`, `d301517`, `81a08b9`,
`98724e1`. Spec: [`specs/v6-two-versions.md`](specs/v6-two-versions.md).

### Four findings from this arc

1. **The mirror must not advance past a conflicted field.** Writing Sapo's new
   value while the conflict was open made the next run see "ours moved, theirs
   did not" — keep-ours — so the parked decision silently resolved itself one
   run later. `holdBase` keeps the previous base for a field still in dispute:
   the mirror records what has been _reconciled_, not what was last fetched.
2. **Resolving must record THEIRS, never the chosen value.** After "keep ours"
   a base equal to our value made the next sync read Sapo's _unchanged_ value
   as an upstream change and overwrite the decision on the spot. Watched it
   happen in the browser; the tests had not thought to ask.
3. **A drop has no position when siblings sort by name.** The offset-based
   projection every dnd-kit tree example uses would have been machinery for an
   ordering this app does not have. Re-parenting is the whole operation, and
   `planMove` fits in forty lines with a cycle guard.
4. **Committing before reading the gate, twice.** Both times coverage had
   already failed on screen. The second was a schema test correctly catching
   two new tables — it did its job; the reading did not.

## v5 — Sharper pictures, and a catalogue you can walk · ✅ 2026-09-01

Four requests. The image half turned out to be a win on both axes rather than
the tradeoff it looked like.

- **The archive is what gets served now.** `mediaSrc` returned a 1600px q82
  WebP frozen at upload, so a 40px thumbnail and a lightbox shared one file.
  It returns the de-logoed original, and every render site goes through
  `next/image`, which derives per-breakpoint copies at request time.
  Measured: **gallery 60 tiles 1.66 MB → 0.44 MB (−73%)**, **products 25 rows
  1.02 MB → 0.02 MB (−98%)**, and the lightbox gained full 2362px detail the
  old cap had discarded. "Persist without optimize" cost nothing; it saved.
- **`/categories/[slug]`** walks root → group → category → product, with
  distinct counts at every level. On "Quạt & Thiết bị làm mát" you see nine
  subcategories each reading 8 and the group reading 8 — the repetition is the
  finding, and showing a product only at its deepest category would have
  hidden it.
- **Borderless tables**, with an indent rail on the category tree. The tree
  needed _more_ than the flat lists, not less: depth is vertical information
  and a rule under a row never expressed it.
- **Four UI fixes** from walking every route at both widths in both themes.

Tasks: V5.1–V5.13, V5.15, V5.16. Commits `120dee7`, `68ad783`, `c915be8`,
`98b12a2`. Spec:
[`specs/v5-pictures-and-walking-the-catalogue.md`](specs/v5-pictures-and-walking-the-catalogue.md).

### Four findings from this arc

1. **The `unoptimized` flag was load-bearing on a false premise.** Its comment
   said the optimizer "cannot reach a relative path during a build". Verified
   before relying on it: `/_next/image` on a local `/uploads` path returns a
   derived WebP, no `remotePatterns` entry needed since it is same-origin.
   Removing one word made the app 73–98% lighter.
2. **A stale `routes.d.ts` in an alternate `distDir` breaks `tsc` for a new
   route.** `.next-e2e/dev/types/` is in `tsconfig.include`, so a route added
   after the last e2e run fails to typecheck with "does not satisfy the
   constraint 'AppRoutes'" while `.next/types/` has it right. Delete the
   stale artifact.
3. **Dark theme hid a light-theme bug for weeks.** Almost every photograph
   here is shot on white; against a near-white `bg-muted` the gallery tiles
   had no edge and the grid dissolved. Invisible in dark, obvious in light —
   an argument for walking both, not just the default.
4. **Committing before reading the gate output.** The section-A commit landed
   with `coverage=1` on screen: a stale assertion still expected the optimized
   variant. Caught and fixed one commit later, but the order was wrong.

## v4 A–C — The catalogue gets a shape · ✅ 2026-09-01

Sapo cannot store a hierarchy — no parent field in the collections API, no
column in the admin list, no indentation in the product picker. The three
levels its storefront shows live entirely in **theme menu config**. So the
tree cannot be fetched; v4 reconstructs it, seeds it into the `parentId`
column migration `002` shipped unused, and **owns it from then on**.

- **The reconstruction agrees with itself.** Menu markup gives root → mid
  (`data-target="<root>-<own>-menu"`); collection creation order gives
  mid → leaf. The two reconcile to exactly **6 + 41 + 163 + 1 standalone =
  211 of 211**, no category with two parents. A disagreement exits non-zero
  rather than preferring one — it is a self-check, not a fallback.
- **`/categories` is a tree**, roots open and branches closed, and its counts
  are **distinct rather than summed**. Eight fans sit in "Quạt & Thiết bị làm
  mát" _and_ in all nine of its children, so summing reports eighty. The group
  now reads 8, and THIẾT BỊ GIA ĐÌNH reads "50 · 0 direct".
- **The 697 are reachable.** `/products?category=none` — a third state of the
  category facet, `not exists` in SQL so the shared total cannot double-count.
- **The product picker opens on 7 rows, not 211**, groups by the tree, and
  searches folded (`quat dung` → `Quạt đứng`) keeping ancestors for context.
  The bar was Sapo's own admin, which is flat and lists a child four rows
  above its parent.
- **`bun run sync:sapo`** refreshes in place without destroying anything
  local. No delete list exists in the plan's _shape_, and `parentId` cannot
  appear in an update. Proven adversarially: two rows corrupted locally, the
  sync reported "1 updated / 210 unchanged" and "1 updated / 831 unchanged",
  restored both, and left the tree at 7/41/163 with 786 media links intact.

Tasks: V4.1–V4.13. Commits `71699b7`, `ee5ec47`, `cbc6e99`, `a5bb064`,
`9f58f02`, `15f50ee`. Spec:
[`specs/v4-taxonomy-and-sync.md`](specs/v4-taxonomy-and-sync.md).

### Four findings from this arc

1. **A parent cycle emptied the forest.** With no root, nothing was reached
   and every category silently vanished from the page. Anything unreached is
   now promoted to the top level: a row in the wrong place is fixable, one
   that is not rendered is invisible. Found by writing the test first.
2. **Kysely rows are not plain objects.** `listLinks` returned them straight
   through; it builds fine and throws "Only plain objects can be passed to
   Client Components" **on the request**. The build is not the gate that
   catches this — running the app is.
3. **Creation order is a one-time reconstruction, not a derivation.** A
   category added tomorrow gets the highest id, lands past every block, and a
   naive walk files it under whichever group came last. `knownMaxSourceId`
   turns that into `unfiled`, and the sync never writes `parentId` at all.
4. **Sapo files VAT rates in the category namespace.** `Thuế 8%` is one of the
   two "categories" on the store's iron. The storefront API filters them and
   the admin API does not, so `assertNoTaxRules` **fails** rather than
   filtering — a tax rule reaching the tree would become a root with 800
   children.

## v3 — The real catalogue, and a link back to Sapo · ✅ 2026-08-31

The dashboard stopped being a demo. `bun run seed` now loads **832 real
products, 211 categories and 786 photographs** cloned from the Sapo store, and
every imported row knows where it came from.

- **`data/sapo/`** — the snapshot, regenerated by `bun run fetch:sapo`. It uses
  the **public** storefront API, not `/admin/*.json`, so it needs no session
  cookie; the two were compared row by row first and the only difference is a
  tax rule ("Thuế 8%") that holds every product and is not a category.
- **The watermark comes off.** 255 images carried a "Tam Anh Tài" logo. It is
  found by its three brand colours and erased **only when the ring around the
  box is already white** — which is what saves the four Shopee/WonderWear
  banners that use the same colours from having a hole punched in them.
- **Files are named after the product**: `<slug>-<n>-original.<ext>` and
  `<slug>-<n>.webp`, at the same 4096/1600px and q92/q82 the browser uploader
  uses, so a seeded row is indistinguishable from an uploaded one. The
  filename is the storage key, so the URL reads as the product.
- **Migration 005 adds `sapoId`** to products and categories — nullable,
  unique, no foreign key. Sapo is the system of record; this app is the
  pleasant way to read the catalogue, and `Open in Sapo` is one click from a
  row here to the row that owns it.

### Four findings from this arc

1. **`ensureAlpha(0)` before `flatten` leaves four channels** in sharp's raw
   buffer. Every read in the detector assumed three, and the misalignment was
   silent: it reported 289 plausible-looking colour hits and erased nothing.
   The script now asserts the channel count rather than trusting the pipeline.
2. **`migrateDown()` in a test means "undo the last one", not "undo 004".**
   Two migration tests were pinned to 004 by stepping down once, and adding
   005 quietly repointed them. `migrateTo("003-init-products")` says what was
   meant.
3. **A dev server started before `db:reset` holds the deleted database file**
   and fails with `schema drift` on the new column — which reads exactly like
   a repository bug and is not one.
4. **Real data moves the caps.** `PRODUCT_NAME_MAX` and
   `PRODUCT_DESCRIPTION_MAX` were set to round numbers; one real name is 150
   characters and 184 descriptions passed 5,000. Both moved to fit the
   catalogue rather than the catalogue being trimmed to fit them.

## v2 — Media becomes a library · ✅ 2026-08-28

The model change: an asset no longer belongs to a product. It lives in a
library, and products **link** to it — the Photos/Shopify shape.

- **Migration 004** — `media_assets` (no owner) + `product_media`
  (productId · mediaId · position). Every existing attachment is **backfilled**
  into both, keeping its id so paths already on disk resolve; the old table is
  dropped. Down is honestly lossy and says so.
- **Upload anywhere.** The gallery takes a batch with no product in mind; the
  product form uploads to the library and links in one step. One
  `useMediaUpload` hook and one `UploadZone` serve both — the loop was welded
  into the product form and a second copy would have drifted on the first bug.
- **Pick from the library** when editing a product, with a multi-select dialog
  that offers only what is not already attached.
- **Consequences, made explicit in the UI.** Removing a photo from a product
  unlinks it; deleting a product deletes no files; deleting from the library
  names the products it will break before it does it. An `Unused` filter
  answers "what have I uploaded and not used yet".
- **Alt text moved onto the asset** and is edited in the full-screen viewer —
  it describes the picture, and it was previously typed against a 120px
  thumbnail.

### v2.1 — the upload ceiling (same day)

The 8 MB image cap ran **in front of** the optimizer, so a 12 MB phone
photograph was rejected before the thing built to shrink it ever saw the file.

- Ceiling raised to **25 MB**; a 48MP iPhone JPEG is 10–15 MB and a 200MP
  Android frame can pass 20.
- The stored original is capped at **4096px**: above it, a q0.92 re-encode; at
  or below, the true bytes, byte-identical. Reported as `origin-resized` so the
  UI can say which happened — it is the one degradation that loses pixels.
- **One decode, two encodes.** Decoding a 48MP frame is seconds on a phone;
  the encoder now takes a _plan_ computed from the source dimensions, which
  are not known until after the decode.
- **Animated GIFs are never re-encoded** — a canvas pass keeps one frame, and
  the catalogue would show a still with nothing able to explain it.
- The E2E suite uploads a generated 5000×3000 file and asserts it comes back
  4096×2458. Every unit test around that path mocks the canvas; this is the
  only place the browser's real encode runs.

### Four findings from this arc

1. **A client component must not import a repository module.** Twice now.
   `gallery-grid` importing `groupByMonth` dragged `node:async_hooks` and the
   Neon driver into the browser bundle and failed the route's build outright.
   The pure fold lives in `media/grouping.ts`; the in-memory twin lives in
   `media/in-memory.ts` for the same reason.
2. **`bun run seed` cannot import `env-server.ts`.** It carries `server-only`.
   The storage readers moved to `storage/config.ts`, the twin of `db-url.ts`,
   which exists for exactly this and whose docblock had already warned about it.
3. **Optimistic lists must de-duplicate, not clear on a timer.** Clearing the
   locally-held uploads when the refresh is _dispatched_ is a race: React holds
   the state update until the transition completes, so both copies render and
   every file appears twice. Filtering by what the server already sent removes
   the copy exactly when it becomes redundant.
4. **`createMany` returning sorted rows contradicted its caller's contract.**
   The hook matches results to files by position. It now returns input order,
   matched by minted id rather than trusting `RETURNING`'s row order, which no
   driver guarantees.

## v1.1 — Gallery and responsive container · ✅ 2026-08-28

- **`/gallery`** — every attachment in one Photos-style grid: square cropped
  tiles, month grouping with sticky headers, edge-to-edge on a phone, 3→10
  columns by viewport, and a full-screen viewer with arrow-key and swipe
  navigation. Kind tabs carry counts; the product filter offers only products
  that actually have media.
- **`PageContainer`** — a centred column per page, 1280px for tables and forms
  and 1920px for the gallery. Tables drop secondary columns on a phone rather
  than scrolling sideways.
- **The seed now generates placeholder images** (`seed-media.ts`, PNG encoded
  in-process), so the gallery means something on a fresh clone. Every fourth
  product is left bare on purpose — a row with no image has to look deliberate.

### v2.1 — the upload ceiling (same day)

The 8 MB image cap ran **in front of** the optimizer, so a 12 MB phone
photograph was rejected before the thing built to shrink it ever saw the file.

- Ceiling raised to **25 MB**; a 48MP iPhone JPEG is 10–15 MB and a 200MP
  Android frame can pass 20.
- The stored original is capped at **4096px**: above it, a q0.92 re-encode; at
  or below, the true bytes, byte-identical. Reported as `origin-resized` so the
  UI can say which happened — it is the one degradation that loses pixels.
- **One decode, two encodes.** Decoding a 48MP frame is seconds on a phone;
  the encoder now takes a _plan_ computed from the source dimensions, which
  are not known until after the decode.
- **Animated GIFs are never re-encoded** — a canvas pass keeps one frame, and
  the catalogue would show a still with nothing able to explain it.
- The E2E suite uploads a generated 5000×3000 file and asserts it comes back
  4096×2458. Every unit test around that path mocks the canvas; this is the
  only place the browser's real encode runs.

### Four findings from this arc

1. **A client component must not import a repository module.** `gallery-grid`
   imported `groupByMonth` from `media-repository.ts`, which dragged
   `readContext` → `db.ts` → `node:async_hooks` into the browser bundle and
   failed the route's build outright. The pure fold now lives in
   `media-grouping.ts`, whose only repository import is type-only.
2. **`SidebarInset` already renders `<main>`.** The shell nested a second one
   — invalid HTML, and two "main" landmarks for a screen reader. Found by an
   E2E assertion that could not locate the landmark it needed.
3. **Content is centred within `<main>`, not the viewport.** The first version
   of that test failed by exactly the sidebar's 256px. The layout was right;
   the assertion was measuring the wrong box.
4. **An `<img>` cannot hold a table column open.** Preflight caps images at
   `max-width: 100%`, so beside a `w-full` neighbour the image sizes to the
   cell while the cell sizes to the image, and the pair settles at 4px. A
   fixed-size wrapper `div` breaks the cycle.

## v1 — Product admin dashboard · ✅ COMPLETE 2026-08-28

Spec: [`specs/v1-product-dashboard.md`](specs/v1-product-dashboard.md). Four commits on `main`, gates green at each.
All nine acceptance criteria met. **319 unit + integration tests, 2 Playwright
specs**, coverage 93.4% lines / 90.8% branches / 91.6% functions.

- 2026-08-28 · `4ad863b` · **U.1–U.6, T.1–T.2** Dashboard shell, URL-driven
  product list (search · status · category · 6 sorts · paging), shared
  create/edit form, attachments field with per-file progress and dnd-kit
  reorder, categories CRUD, Playwright smoke, README.
- 2026-08-28 · `08150fe` · **P.1–P.7, D.6, A.1–A.3, S.1–S.3** Entities,
  repositories with in-memory twins, pure list-query parser, save/delete
  operations, money as integer minor units, slug derivation, storage seam,
  better-auth with a production-hard dev bypass, 30-product seed.
- 2026-08-28 · `7eec8b0` · **M.1–M.6** `src/lib/media/` — validation, fit
  maths, WebP re-encode and video poster behind an injected ops seam,
  `prepare()` orchestration.
- 2026-08-28 · `32e4554` · **F.1–F.3, D.1–D.5** Scaffold from
  `@vinhnnn/dev-workflow` v3.0.1, toolchain and gates, the embedded-SQLite
  Kysely dialect and its runtime-detecting opener, driver seam, request
  context, uuid v7 ids, migrations 001–003, shadcn radix-maia.

### Five things a future session should not have to relearn

1. **`bun:sqlite` is not reachable from `next dev` or Vitest.** Both run on
   Node; only `bun run migrate` / `bun run seed` run on Bun. An unconditional
   import throws `Cannot find package 'bun:sqlite'`. `lib/db/sqlite-open.ts`
   detects the runtime and falls back to `node:sqlite`.
2. **`LOWER()` in SQLite is ASCII-only.** `LOWER(name) LIKE LOWER(?)` finds no
   Vietnamese name locally while Postgres finds it — a bug visible on exactly
   one driver. Search compares a JS-folded `searchText` column instead, which
   also makes `ao dai` find `Áo Dài`.
3. **A taken slug is only an error when it was typed.** A _derived_ collision
   means two products share a name, which is legitimate; the controller
   suffixes it. Rejecting both made the suffixing unreachable.
4. **Writing a ref during render is a real bug, not a lint nit.** The
   attachments field did it so its async upload loop could see current state;
   React may discard that render. Functional updates are the answer.
5. **`next build` marks a page static if it never reads cookies/headers**,
   even when it queries the database — `/sign-in` was prerendering its
   operator list. It is `force-dynamic` now.

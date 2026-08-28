# Done — write-once ship history

> Newest at top: `YYYY-MM-DD · <sha> · <task id> <description>`.
> Cut the line out of [`backlog.md`](backlog.md); never keep-and-tick.

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

# Done — write-once ship history

> Newest at top: `YYYY-MM-DD · <sha> · <task id> <description>`.
> Cut the line out of [`backlog.md`](backlog.md); never keep-and-tick.

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

Spec: [`spec.md`](spec.md). Four commits on `main`, gates green at each.
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

# v1 — Product admin dashboard

**Status:** 🚧 In progress (started 2026-08-28)

## Goal

A traditional admin dashboard for managing a **product catalogue**. An operator signs
in, lands on `/products`, and can **list · search · filter · sort · paginate · create ·
edit · archive** products. Each product carries **many categories** and an **ordered set
of attachments** (images and videos). Every attachment is stored **twice** — the
untouched **origin** and a web-delivery **optimized** variant — with the optimization
performed in the browser before upload by a reusable library (`src/lib/media/`).

Local development runs on **`bun:sqlite`** for zero-setup speed. The same Kysely query
layer targets **Neon Postgres + Vercel Blob** in deployed environments; the driver is
chosen from env, and no feature code knows which one is live.

**Not event-sourced.** Plain CRUD repositories over tables, per the explicit scope call.

## Out of scope

- Product **variants**, options, inventory and stock movements (deliberate — the "core
  catalogue" answer, 2026-08-28). The schema leaves room; the UI does not pretend.
- **Server-side** image/video transcoding (`sharp` / `ffmpeg`). The optimized variant is
  produced client-side; a server pipeline is a later version if quality demands it.
- **i18n**. English only for v1 (decided 2026-08-28). Strings stay grouped per feature so
  a `messages.ts` retrofit stays cheap.
- Storefront, cart, orders, pricing rules, tax. This is the back office only.
- Multi-tenant / per-user product ownership. Any signed-in operator sees one catalogue.
- Category **tree** editing UI beyond create/rename/delete (`parentId` exists in the
  schema; v1 renders one flat level).
- Soft-delete restore UI, audit log, bulk import/export.

## User stories and acceptance criteria

### AC-1 · Sign in

Visiting any `/(dashboard)` route without a session redirects to `/sign-in`. Sign-in
offers **Google** (better-auth social provider) when `GOOGLE_CLIENT_ID` +
`GOOGLE_CLIENT_SECRET` are set, and a **local bypass** (`ALLOW_DEV_LOGIN=1`, never
production) that mints a session for a seeded operator without an OAuth round-trip.
`requireUser()` re-gates every server action independently of the layout.

### AC-2 · Product list

`/products` renders a table: thumbnail · name (+ sku) · price · status · categories ·
updated. Above it: a **search box** (name / sku / description, debounced), a **status**
filter, a **category** filter, and a sortable "updated / name / price" control. State
lives in the **URL query** (`?q=&status=&category=&sort=&page=`) so a filtered view is
linkable and survives reload; the server re-queries per change with **keyset-free offset
pagination** (25/page) and a total count. Empty and no-match states are distinct.

### AC-3 · Create a product

`/products/new` is a form: name (required) · slug (auto-derived from name, editable,
unique) · sku (optional, unique when present) · description · price + currency · status
(draft/active/archived) · **multi-select categories** · **attachments**. Submitting runs
one server action which validates with zod, writes the product, its category links and
its attachment rows in **one transaction**, and redirects to the product's edit page.
Validation failures re-render the form with per-field messages and no data loss.

### AC-4 · Edit a product

`/products/[id]` loads the same form pre-filled. Saving diffs categories (add/remove
links) and attachments (add/remove/reorder/alt-text edit) in one transaction. Archiving
is a status change, not a delete. Deleting is available and removes the row, its links
and its attachment rows (blobs are left; orphan sweep is a later item).

### AC-5 · Categories

`/categories` lists categories with a product count each, and supports create · rename ·
delete. Deleting a category removes its links, never its products. A category name is
unique; the slug is derived and unique.

### AC-6 · Attachments — origin + optimized

The attachment field accepts image (`jpeg` · `png` · `webp` · `gif`) and video (`mp4` ·
`webm` · `quicktime`) files by click or drag-drop. For **each** file the client:

1. validates MIME + size against shared caps (8 MB image / 100 MB video),
2. produces an **optimized** variant — images re-encoded to WebP, longest edge capped at
   1600px, quality 0.82; videos keep their bytes and instead gain a **poster** frame
   grabbed at ~1s and encoded as WebP,
3. uploads **both** (origin and optimized/poster) and records
   `{kind, originUrl, optimizedUrl, posterUrl, mime, bytes, optimizedBytes, width,
height, durationMs, position, alt}`.

Progress is shown per file, failures are per-file (one bad file does not lose the
others), thumbnails are reorderable by drag, and the first image is the product's
primary. The list and detail views read `optimizedUrl`; a "view original" link exposes
`originUrl`.

### AC-7 · The media library is standalone and tested

`src/lib/media/` is pure/DOM-only — no React, no Next, no network. `constraints.ts` and
the naming/derivation helpers are unit-tested without a DOM `File`; the canvas encoders
are exercised through a thin injectable seam so the pure parts stay covered.

### AC-8 · Storage and DB are swappable by env

`DATABASE_DRIVER=sqlite|postgres` selects `bun:sqlite` or Neon at the Kysely dialect
seam. `STORAGE_DRIVER=local|blob` selects on-disk `.data/uploads` (served by a route) or
Vercel Blob. Feature code calls `storage.upload()` / repositories only — no call site
branches on the driver. Switching drivers changes no query and no component.

### AC-9 · Gates

`bun run lint` · `bunx tsc --noEmit` · `bun run test:coverage` · `bun run build` all
green. One Playwright smoke test walks sign-in → create a product with one image →
see it in the filtered list → edit it.

## Non-functional

- **Zero-setup local start**: `bun install && bun run db:local && bun run dev` with no
  Docker, no cloud account. The SQLite file lives at `.data/the-greatness.db` (gitignored).
- **`src/lib/` purity** — no `react`, `next/*`, `Date.now()` in pure modules; time and
  ids arrive as parameters or via the clock/id seams.
- **Coverage ≥ 90%** on the pure layer (`lib/media`, `lib/products` derivers, slug).
- **A11y**: every control keyboard-reachable, the table is a real `<table>`, drag-reorder
  has a keyboard fallback, upload progress is announced via `aria-live`.
- Dark mode from the first commit (shadcn tokens + `next-themes`).

## Open questions

- **Orphan blobs.** Deleting a product leaves its uploaded files behind. Sweep job or
  reference-counted delete — decide when a second feature also uploads.
- **Video optimization.** Origin-only for video in v1 (poster aside). If bandwidth
  becomes a real cost, revisit with a server-side `ffmpeg` step rather than WebCodecs.
- **Search.** `LIKE` over three columns is right for a few thousand rows. Postgres
  full-text (or `pg_trgm`) is the upgrade path; the query lives behind one repository
  method so the swap is local.

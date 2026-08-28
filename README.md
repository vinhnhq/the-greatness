# The Greatness

A product-catalogue admin dashboard. Sign in, then list · search · filter ·
sort · create · edit products, each with many categories and an ordered set of
image and video attachments — plus a **gallery** of every asset in the
catalogue, laid out like a photo library.

Every attachment is stored **twice**: the untouched original, and a
web-delivery variant produced in the browser before upload.

Built for both ends of the range: a centred column that stops a table
stretching across a 27" monitor, and a layout that holds at 390px with no
horizontal scrolling anywhere.

## Start it

```bash
bun install
bun run db:local     # migrate + seed 30 products across 8 categories
bun run dev          # http://localhost:3000
```

No Docker, no cloud account, no `.env` needed. The first run creates
`.data/the-greatness.db` and seeds an operator; `/sign-in` offers them in a
development picker.

## Two seams, one codebase

Local development and a deployment differ only in two environment variables.
Nothing in the feature code branches on either.

| Seam         | Local (default)                                                         | Deployed                                                                              |
| ------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Database** | `DATABASE_DRIVER=sqlite` — embedded SQLite at `.data/the-greatness.db`  | `DATABASE_DRIVER=postgres` + `DATABASE_URL` — Neon over HTTP                          |
| **Storage**  | `STORAGE_DRIVER=local` — `.data/uploads`, served by `/uploads/[...key]` | `STORAGE_DRIVER=blob` + `BLOB_READ_WRITE_TOKEN` — Vercel Blob, uploaded client-direct |
| **Sign-in**  | `ALLOW_DEV_LOGIN=1` — passwordless operator picker                      | Google OAuth (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)                            |

Setting only `DATABASE_URL` is enough to select Postgres — a Vercel project
with a Neon integration does the right thing with no second variable.

`.env.example` documents every key. Copy it to `.env.local` to change anything.

### About "bun:sqlite"

The local driver uses **Bun's** built-in SQLite when Bun is the host
(`bun run migrate`, `bun run seed`) and **Node's** `node:sqlite` otherwise
(`next dev`, Vitest) — Next spawns its server through Node, so an
unconditional `bun:sqlite` import throws there. `src/lib/db/sqlite-open.ts`
picks between them; both are embedded SQLite with the same C library
underneath, and neither needs a native dependency or `node-gyp`.

## The media library

`src/lib/media/` is the piece worth reading first. It takes a picked `File`
and returns everything that will be stored:

```
file → validate (MIME + size caps: 25 MB image, 100 MB video)
     → images: ONE decode, then
         archive — 4096px q0.92, produced only if the source is bigger
         display — 1600px q0.82
       video:  keep the bytes, grab a poster frame ~1s in
     → { origin, optimized?, poster?, width, height, durationMs }
```

**A phone photograph is bigger than 8 MB, so the ceiling is 25.** The first
version gated at 8 MB _in front of_ the optimizer — turning away exactly the
files it was built to handle. Above 4096px the stored "original" is a
high-quality re-encode rather than the literal file: a 48MP frame is 12 MB to
upload and 12 MB to keep forever, and nothing a catalogue does with a product
photo needs more than 4096px. At or below the cap the true bytes are stored
untouched, and the UI says which happened.

Three properties it holds, each with tests written around it:

- **Past validation, the origin always survives.** A failed decode, an
  unavailable canvas, a video whose poster cannot be grabbed — each degrades
  to "origin only" with a note, never to a lost file. One bad file in ten must
  not cost the other nine.
- **A re-encode that came out larger is discarded.** A flat PNG logo routinely
  "optimizes" bigger; storing that would make every page load pay for it. The
  same test guards the archive copy: if shrinking a huge file does not actually
  save bytes, the pixels are not worth taking.
- **An animated GIF is never re-encoded.** A canvas pass keeps one frame, and
  the catalogue would show a still with nothing able to say why.
- **The DOM calls hold no decisions.** `createImageBitmap`, `OffscreenCanvas`
  and the `<video>` seek live in `*.browser.ts` files behind an injected seam,
  so the logic is unit-tested and the adapters are a file boundary a decision
  cannot quietly cross.

Uploading is deliberately asymmetric (`src/lib/storage/upload.ts`): the origin
goes first and alone, and a derived file failing afterwards is swallowed to
null rather than losing an upload the operator already waited for.

## The gallery

`/gallery` is every image and video in the catalogue in one grid — the inverse
of `/products`, which is products that happen to have media.

- Square cropped tiles, grouped by month with sticky headers, **edge-to-edge
  on a phone** and three-to-ten columns depending on the viewport. A wider
  screen means more photos, not bigger ones, which is why this page gets a
  wider container than the rest of the app.
- Tapping one opens a full-screen viewer: arrow keys and swipe move between
  items, Escape closes, and the caption names the product, its price and a
  link to edit it. The image is never cropped and **never upscaled** — this is
  the screen where an operator checks what they actually uploaded.
- The kind tabs carry counts (`Videos 0`), because a tab you have to press to
  discover is empty is a tab that punishes pressing it.

## Layout

Every page renders inside a `PageContainer`, and pages disagree about width
on purpose: tables and forms get 1280px, the gallery gets 1920px. Baking one
width into the shell means the page that needs another escapes with negative
margins.

The E2E suite asserts both ends — no page scrolls sideways at 390px, and the
content stays centred within `<main>` at 2560px. Those are the two failures a
unit test structurally cannot catch.

## Search

Product search folds both sides — lowercase, NFD, diacritics stripped, `đ→d` —
into a stored `searchText` column, so `ao dai` finds `Áo Dài Lụa`.

That is not only a nicety. `LOWER()` in SQLite is ASCII-only (no ICU), so the
obvious `LOWER(name) LIKE LOWER(?)` finds nothing for a Vietnamese name
locally while Postgres finds it — a bug visible on exactly one driver. Folding
in JavaScript makes a plain `LIKE` behave identically on both.

## Commands

```bash
bun run dev              # next dev --turbopack
bun run build            # next build
bun run lint             # oxlint --type-aware + oxfmt --check
bun run format           # oxfmt .
bun run migrate <cmd>    # latest | up | down | status
bun run seed             # sample catalogue
bun run db:local         # migrate + seed
bun run db:reset         # wipe .data and rebuild
bun run test             # vitest, both projects
bun run test:unit        # pure logic only
bun run test:integration # repositories against a scratch SQLite file
bun run test:coverage    # both + thresholds — the real gate
bun run test:e2e         # playwright, against its own database
```

**`bun test` is not `bun run test`.** The first invokes Bun's built-in runner,
finds zero Vitest files and exits 0 — a green result that tested nothing.

## The four gates

Green before any task is done, per [`dev-workflow.md`](dev-workflow.md):

```bash
bun run lint && bunx tsc --noEmit && bun run test:coverage && bun run build
```

CI (`.github/workflows/ci.yml`) runs the same four on every PR.

## Layout

```
src/
  app/
    (dashboard)/        products, categories — gated by the layout AND per action
    api/attachments/    upload token (blob) and receiver (local)
    uploads/[...key]/   serves locally-stored files
    sign-in/
  components/ui/        shadcn primitives (radix-maia, neutral) — edited in place
  lib/
    db/                 the SQLite dialect and its runtime-detecting opener
    domain/             entities, repositories (+ in-memory twins), operations
    media/              the upload library
    storage/            the two drivers behind one interface
  db/migrations/        kysely migrations
  tests/{unit,integration}/
e2e/                    playwright smoke
__project__/            specs, decisions, backlog, done, retro
```

## Where the reasoning lives

- [`__project__/specs/`](__project__/specs/) — goal, out of scope, acceptance
  criteria, per version. **v1 is frozen and partly superseded** by v2; its
  header says which parts.
- [`__project__/decisions/`](__project__/decisions/README.md) — the two
  structural decisions: media ownership, and the 4096px archive cap.
- [`__project__/backlog.md`](__project__/backlog.md) — what is left.
- [`__project__/done.md`](__project__/done.md) — what shipped, newest first.
- [`__project__/retro.md`](__project__/retro.md) — what the traps were.
- [`CLAUDE.md`](CLAUDE.md) — conventions and the load-bearing gotchas.
- [`dev-workflow.md`](dev-workflow.md) — the process and the quality bar.
- Module docblocks carry the _why_. Where a decision looks arbitrary, the
  comment above it usually names the failure it prevents.

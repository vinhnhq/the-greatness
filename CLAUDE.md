@AGENTS.md

# CLAUDE.md

Guidance for Claude Code in this repository. **Read this first; it is
deliberately short and delegates everything else.**

## What this is

A **product-catalogue admin dashboard** built on Next.js 16 + Bun. An operator
signs in, manages products with many categories, and works from a **media
library** that products link into. Local development runs on embedded SQLite
with files on disk; deployed it is Neon + Vercel Blob, chosen by two
environment variables and nothing else.

Scaffolded 2026-08-28 from `@vinhnnn/dev-workflow` v3.0.1; conventions follow
the practice `~/github.com/infinite-oneness` settled on (oxc toolchain, TS 7,
Kysely, co-located operations, `__project__/` docs).

## Authoritative sources — read these before answering

- **Process** — [`dev-workflow.md`](dev-workflow.md) at root. Six phases, the
  engineering principles, and the **four gates**. Canonical; this file only
  adds project-specific context.
- **Current state** — [`__project__/done.md`](__project__/done.md) (write-once
  ship history) and [`__project__/backlog.md`](__project__/backlog.md) (open
  work only). Headline as of 2026-08-28: **v1, v1.1, v2 and v2.1 all shipped
  in one session on `main`**; nothing is deployed yet, and neither the Neon nor
  the Blob seam has met the real service (backlog N.3).
- **Intent** — [`__project__/specs/`](__project__/specs/). v1 is **frozen and
  partly superseded** — it describes media as belonging to a product, which
  [v2](__project__/specs/v2-media-library.md) inverted. Its header says so.
- **Decisions** — [`__project__/decisions/`](__project__/decisions/README.md).
  Two, both about what a row means: media ownership and the 4096px archive cap.
  Append-only; a change of course is an `## Amendments` section.
- **Lessons** — [`__project__/retro.md`](__project__/retro.md). Read this
  before a long autonomous run; it is where the traps are recorded.
- **The reader's view** — [`README.md`](README.md).

## Commands

```bash
bun install
bun run dev              # next dev --turbopack (http://localhost:3000)
bun run build            # next build
bun run lint             # oxlint --type-aware + oxfmt --check
bun run format           # oxfmt .
bun run migrate <cmd>    # latest | up | down | status
bun run seed             # 1 operator, 8 categories, 30 products, 36 images
bun run db:local         # migrate + seed
bun run db:reset         # wipe .data and rebuild
bun run test             # vitest, both projects
bun run test:unit        # pure logic only
bun run test:integration # repositories against a scratch SQLite file
bun run test:coverage    # both + thresholds — the REAL gate
bun run test:e2e         # playwright, against its own database
```

**The four gates**, green before any task is done — `dev-workflow.md` owns this
line, everything else points here:

```bash
bun run lint && bunx tsc --noEmit && bun run test:coverage && bun run build
```

## Load-bearing gotchas

Things a session will hit, in rough order of how much time they cost.

- **`bun test` ≠ `bun run test`.** The first invokes Bun's built-in runner,
  finds zero Vitest files and exits 0 — a green result that tested nothing.
- **`bun:sqlite` is unreachable from `next dev` and Vitest.** Both run on Node;
  only `bun run migrate` / `bun run seed` run on Bun. `lib/db/sqlite-open.ts`
  detects the runtime and falls back to `node:sqlite`. An unconditional
  `bun:sqlite` import throws `Cannot find package`.
- **A client component must not import a repository module.** It drags
  `readContext` → `db.ts` → `node:async_hooks` and the Neon driver into the
  browser bundle and **fails the route's build**. Pure helpers used by client
  components live in their own file (`media/grouping.ts`, `media/in-memory.ts`)
  and say why at the top. This has happened twice.
- **`env-server.ts` carries `server-only`** and throws in any CLI script.
  Config a script needs lives in `db-url.ts` and `storage/config.ts`, which do
  not. Check for an existing reader before adding one.
- **`LOWER()` in SQLite is ASCII-only.** Never fold case in SQL. Search
  compares a `searchText` column folded in JS (`lib/search-text.ts`) against an
  identically-folded term, so a plain `LIKE` behaves the same on both drivers
  and `ao dai` finds `Áo Dài`.
- **Every server action calls `requireUser()` itself.** An action is its own
  HTTP endpoint; the `(dashboard)` layout's gate never runs for it.
- **Migrations are append-only and must backfill.** One that needs `db:reset`
  is a reset with extra steps. `004` is the worked example.
- **React Compiler is on.** Hand-written `useMemo`/`useCallback` are usually
  redundant, and **writing a ref during render is a build error, not a nit** —
  use a functional state update.
- **Tailwind preflight caps images at `max-width: 100%`.** An `<img>` cannot
  hold a table column open beside a `w-full` neighbour; wrap it in a
  fixed-size `div`.
- **Middleware in Next 16 is `src/proxy.ts` exporting `proxy`** — not
  `middleware.ts`. (None exists yet.)
- **Tailwind v4 has no config file.** Tokens live in `src/app/globals.css` via
  `@theme`; the preset is shadcn `radix-maia`, base `neutral`.

## Conventions

- **Filenames** kebab-case inside `src/` and `__project__/`; component
  identifiers stay PascalCase. Root tooling files keep conventional casing.
- **Imports** absolute via `@/`.
- **Pure core, imperative shell.** Business rules are pure functions returning
  tagged unions (`lib/result.ts`); I/O lives in repositories that read the
  connection from `readContext()`. Never `import { db }` outside `context.ts`
  and `auth.ts`. Never read context inside a cached compute function.
- **Operations are co-located**: `lib/domain/<entity>/operations/<verb-noun>/`
  holds `invariants.ts` (pure, reports every field at once) and `controller.ts`
  (dependencies injected by closure).
- **Every repository has an in-memory twin.** It is the second opinion, not a
  convenience — see the retro. Do not delete it to reduce duplication.
- **Coverage excludes are for decision-free adapters only.** If a `*.browser.ts`
  file or a driver acquires an `if`, that logic belongs in its measured sibling.
- **Commits** Conventional Commits, atomic, one type each. Commit at every
  green checkpoint on a long run: compaction is lossy, artifacts are not.

## Where the reasoning lives

Module docblocks carry the _why_, and they are load-bearing rather than
decorative — where a decision looks arbitrary, the comment above it usually
names the failure it prevents. `lib/media/`, `lib/db/sqlite-dialect.ts` and
`lib/storage/upload.ts` are the three worth reading before changing anything
near them.

@AGENTS.md

# CLAUDE.md

Guidance for Claude Code in this repository. **Read this first; it is
deliberately short and delegates everything else.**

## What this is

A **product-catalogue admin dashboard** built on Next.js 16 + Bun. An operator
signs in, manages products with many categories from a **taxonomy tree** that
holds the whole catalogue, and works from a **media library** that products
link into. **Sapo is the system of record** — this is
a companion view over the same catalogue, and every imported row carries a
`sapoId` that `lib/sapo.ts` turns into a link back to it. Local development runs on embedded SQLite
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
  work only). Headline as of **2026-09-02**: v1 → v7 shipped. v1–v2.1 are on
  `main`; **v3 → v7 are 30 commits on the unmerged branch `feat/v4-taxonomy`**,
  gates green, no PR opened yet. Two things are still true from day one:
  **nothing is deployed**, and neither the Neon nor the Blob seam has met the
  real service (backlog `N.3`) — that remains the largest unmeasured risk.
- **Intent** — [`__project__/specs/`](__project__/specs/), one per version.
  v1 is **frozen and partly superseded** — it describes media as belonging to
  a product, which [v2](__project__/specs/v2-media-library.md) inverted. Its
  header says so. Each spec's `Status:` line is the truth about what of it
  shipped; v5 and v6 each name one task that did not. **There is no v3 spec** —
  the Sapo catalogue import shipped without one; its record is the `done.md`
  entry and the `fetch:sapo` / `prepare:sapo-media` docblocks.
- **Decisions** — [`__project__/decisions/`](__project__/decisions/README.md).
  Three. Two about what a row _means_ (media ownership, the 4096px archive
  cap) and [`0003`](__project__/decisions/0003-mirror-and-reconciliation.md)
  about what each system _owns_ — the mirror, the three-way merge, and why
  this is not event-sourced. Append-only; a change of course is an
  `## Amendments` section.
- **Research** — [`__project__/research/`](__project__/research/). Findings
  about things outside this repo, each dated because they go stale.
  [`write-back-and-other-platforms.md`](__project__/research/write-back-and-other-platforms.md)
  is the one that matters: **Sapo has no menu API**, so the category tree can
  never be pushed and `categories.parentId` is permanently ours.
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
bun run seed             # 1 operator + the real Sapo catalogue (data/sapo/)
bun run sync:sapo        # three-way merge; never deletes, never writes parentId
bun run sync:sapo --plan # dry run — a real run in a rolled-back transaction
bun run fetch:sapo       # re-pull the catalogue; --images for the originals
bun run prepare:sapo-media  # de-logo, resize and rename into data/sapo/media/
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
- **A dev server started before `db:reset` holds the deleted database file.**
  `db:reset` is `rm -rf .data`, so an already-running `next dev` keeps serving
  the old inode and fails with `parse…Strict: schema drift`. Restart it; the
  error names the new column and looks like a repository bug.
- **`bun run seed` needs `data/sapo/`.** The JSON is committed; the 250 MB of
  images is not. Without `fetch:sapo --images && prepare:sapo-media` the rows
  seed with no pictures, and the summary line says so.
- **`seed` wipes, `sync:sapo` reconciles.** The seed is `deleteFrom` on five
  tables — right for seeding, catastrophic as a job. Use `sync:sapo` against a
  database anyone has touched; it never deletes and never writes `parentId`.
- **The sync is three-way, and the mirror is what makes it safe.**
  `sapo_mirror` holds what Sapo said last time, so a field we changed and Sapo
  did not is **kept**. Two traps, both found the hard way: the mirror must not
  advance past a **conflicted** field (or the conflict silently resolves in our
  favour next run), and resolving a conflict must record **theirs** as the new
  base, never the chosen value (or "keep ours" is overwritten on the next run).
- **The category tree is ours, not Sapo's.** Sapo has no parent field
  anywhere. `lib/sapo-tree.ts` reconstructs it from the storefront menu plus
  collection creation order — **a one-time reconstruction**, not an ongoing
  derivation, because a category added later gets the highest id and would
  file under whichever group came last. New categories arrive _unfiled_.
- **A stale `routes.d.ts` in `.next-e2e/` breaks `tsc` for a new route.**
  Both `.next/types/` and `.next-e2e/dev/types/` are in `tsconfig.include`, so
  a route added since the last `test:e2e` run fails with "does not satisfy the
  constraint 'AppRoutes'" even though the main build has it right. Delete the
  stale directory; it is a build artifact.
- **Images render through `MediaThumb` / `next/image`, never a bare `<img>`.**
  `mediaSrc` returns the **archive**, so an `<img>` hands the browser up to
  1.76 MB for a 40px box. The optimizer works fine on the local `/uploads`
  route — same-origin, no `remotePatterns` needed — and it is what makes
  serving the original cheaper than the old baked variant (−73% on the
  gallery, −98% on the product list).
- **A Kysely row is not a plain object.** Passing one from a server component
  to a client component builds fine and throws "Only plain objects can be
  passed to Client Components" on the request. Rebuild the fields you need.
- **A Tailwind `ring` is drawn _outside_ the box.** On rows with no vertical
  gap — the category tree — a `ring-1` highlight paints over the neighbour
  above and below. Use `ring-inset`. Its twin: `h-*` and `self-stretch` on the
  same element fight, because align-self only stretches an **auto** height, so
  a fixed-height indent rail stops short of a taller row.
- **dnd-kit needs an explicit `id` on `DndContext`.** Without one it mints
  ids from a module-level counter, so the server renders `DndDescribedBy-0`
  and the client `DndDescribedBy-14` — a hydration mismatch on every render,
  silent unless the console is open.
- **A generated `ui/` component may never have been run.** `CommandDialog`
  shipped without its own `<Command>` wrapper (so `CommandInput` throws
  `reading 'subscribe'`) and with its `DialogTitle` outside `DialogContent`.
  Both fixed; the lesson is that `shadcn add` is not a smoke test.
- **cmdk's default matcher does not fold Vietnamese.** Pass
  `filter={(v, s) => foldForSearch(v).includes(foldForSearch(s)) ? 1 : 0}`, the
  same fold as `searchText` and every other search here.
- **A server-rendered node handed to a client component needs a `key`.** It
  crosses the RSC boundary into an array React validates, so an unkeyed
  element warns even though it looks like a lone child.
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

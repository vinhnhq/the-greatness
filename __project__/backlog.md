# Backlog — TDD-ordered task list

> Each leaf task is **red → green → refactor → commit**, atomic, one Conventional Commits
> type per commit. Move completed lines to [`done.md`](done.md) (newest at top) with the
> date and short commit SHA.
>
> **Shipped work lives in [done.md](done.md) (write-once). This file holds ONLY open items.**
>
> Gates for every ticket — see [dev-workflow.md §Quality bar](../dev-workflow.md#quality-bar):
> `bun run lint` · `bunx tsc --noEmit` · `bun run test:coverage` · `bun run build`.
>
> Spec: [`spec.md`](spec.md). Status legend: pending · ↷ stretch · ⏸ blocked

---

## F — Foundation (config, toolchain, gates)

- [ ] **F.1** Toolchain + configs: `mise.toml` (bun 1.4 / node 24), `.oxlintrc.json`,
      `.oxfmtrc.json`, `vitest.config.ts` (unit + integration projects, coverage
      thresholds), `playwright.config.ts`, `.gitignore` (`.data/`, `.env.local`),
      `next.config.ts` (reactCompiler, `useTypeScriptCli`, CSP, image remotePatterns),
      package scripts. **Verify:** all four gates run and pass on the empty app.
- [ ] **F.2** Materialize `dev-workflow-pipeline/` → `.claude/skills/ship-review/SKILL.md`,
      `.claude/scripts/*`, `.claude/settings.json`, `.github/workflows/ci.yml`; adapt the
      bracketed placeholders; delete the staging folder.
- [ ] **F.3** shadcn init (`radix-maia` · neutral · Inter · lucide) + the component set the
      dashboard needs; `globals.css` tokens incl. dark mode; `next-themes` provider,
      `<TooltipProvider>` and `<Toaster>` in the root layout.

## D — Data layer (SQLite now, Neon later — AC-8)

- [ ] **D.1** `src/lib/db/bun-sqlite-dialect.ts` — a Kysely dialect over `bun:sqlite`
      (driver + `SqliteAdapter`/`SqliteIntrospector`/`SqliteQueryCompiler`).
      **Test first:** a temp `:memory:` DB round-trips create → insert → select → delete.
- [ ] **D.2** `src/lib/db.ts` — the driver seam. `DATABASE_DRIVER=sqlite` → D.1 over
      `.data/the-greatness.db`; `postgres` → `NeonDialect`. `src/lib/db-types.ts` holds the
      `DB` interface. **Test:** the seam returns the right dialect per env, and `db-url.ts`
      throws a named error when the Postgres URL is missing.
- [ ] **D.3** `src/lib/id.ts` (`newId()` = uuid v7) + unit tests asserting the _property_:
      v7 version/variant nibbles, uniqueness over 10k, lexical order == generation order.
- [ ] **D.4** `src/lib/context.ts` — `RequestContext` (db · user · requestId),
      `runWithContext` / `getRequestContext` (React `cache`) / `readContext` /
      `withTransaction`. **Test:** `readContext` prefers ALS, falls back to the RSC cache;
      `withTransaction` rolls back on throw.
- [ ] **D.5** Migrations 001–003 + the runner (`bun run migrate`): `001` better-auth tables
      (users · sessions · accounts · verifications), `002` `categories`, `003` `products` +
      `product_categories` + `product_attachments`, with the indexes AC-2's list query
      needs. **Test (integration):** migrate up → down → up on a scratch DB is clean.
- [ ] **D.6** `bun run seed` — one operator + ~8 categories + ~30 demo products with
      attachments pointing at placeholder files, so the dashboard is never empty on a
      fresh clone.

## A — Auth (AC-1)

- [ ] **A.1** `src/lib/env-server.ts` + `env-client.ts` (zod-validated), `devLoginEnabled()`.
      **Test:** the schema rejects a missing secret and accepts the local defaults.
- [ ] **A.2** `src/lib/auth.ts` — better-auth over the Kysely adapter, Google provider
      registered only when both creds exist, `getSession` (`cache()`-wrapped) with the
      direct-DB fallback, `setSession` **throwing in production**, `clearSession`.
      **Test:** `deriveUsername` cases + `setSession` throws when the bypass is off.
- [ ] **A.3** `/sign-in` page — Google button + the dev bypass picker (only when enabled);
      `src/lib/require-user.ts`; `(dashboard)` layout gate. **Verify:** signed-out visit to
      `/products` redirects; the bypass lands on `/products`.

## M — Media library (AC-6, AC-7) — _the piece worth getting right first_

- [ ] **M.1** `src/lib/media/constraints.ts` — MIME allow-lists, size caps, `kindOf(mime)`,
      `validateFile({type,size})` returning **error codes**, not prose.
      **Test:** every allow/deny branch, boundary sizes, unknown MIME.
- [ ] **M.2** `src/lib/media/naming.ts` — `originKey` / `optimizedKey` / `posterKey` from a
      product id + filename; extension mapping; unsafe-character stripping.
      **Test:** collisions, unicode names, missing extension, path-traversal attempts.
- [ ] **M.3** `src/lib/media/fit.ts` — pure `fitWithin(w, h, maxEdge)` returning the target
      box. **Test:** landscape, portrait, square, already-smaller (no upscale), zero/NaN.
- [ ] **M.4** `src/lib/media/optimize-image.ts` — `createImageBitmap` → canvas → WebP blob,
      built over an injected `{decode, encode}` seam so M.3's maths is testable and the DOM
      calls sit in one thin adapter. **Test:** the seam is called with the fitted box; a
      decode failure returns a tagged error rather than throwing.
- [ ] **M.5** `src/lib/media/video-poster.ts` — `<video>` seek → canvas → WebP frame +
      `durationMs`/dimensions probe, same injected-seam shape. **Test:** the seek clamps to
      the clip length; a failure degrades to "no poster", never to a failed upload.
- [ ] **M.6** `src/lib/media/prepare.ts` — the one entry point the UI calls:
      `prepare(file) → {origin, optimized?, poster?, meta}`, orchestrating M.1–M.5.
      **Test:** image path, video path, oversize rejection, optimize-failure fallback
      (upload the origin alone rather than fail the file).

## S — Storage seam (AC-8)

- [ ] **S.1** `src/lib/storage/types.ts` + `local.ts` — write under `.data/uploads/**`,
      return `/uploads/<key>`; `GET /uploads/[...key]` route serves them with the right
      content type and an immutable cache header. **Test:** key sanitisation refuses `..`.
- [ ] **S.2** `src/lib/storage/blob.ts` — `@vercel/blob` client-upload token route
      (`POST /api/attachments/upload-url`) gated on a session, capped by M.1's limits.
- [ ] **S.3** `src/lib/storage/index.ts` — `STORAGE_DRIVER` seam + the client-side
      `uploadPrepared()` helper that PUTs origin + optimized + poster and reports progress.

## P — Products domain (AC-2 … AC-5)

- [ ] **P.1** `src/lib/domain/categories/{entity,repository}.ts` — zod row parser, branded
      `CategoryId`, db + in-memory repos. **Test:** parser drift, in-memory CRUD, unique slug.
- [ ] **P.2** `src/lib/slug.ts` — `slugify` + `uniqueSlug(base, taken)`. **Test:** unicode,
      Vietnamese diacritics, collisions → `-2`, `-3`, length cap.
- [ ] **P.3** `src/lib/domain/products/entity.ts` — `Product`, `ProductStatus`,
      `Attachment`, branded ids, `Money` (integer minor units) + `formatMoney`.
      **Test:** parser, money rounding/formatting, illegal status rejected.
- [ ] **P.4** `src/lib/domain/products/repository.ts` — `list(query)` (search · status ·
      category · sort · page → rows + total), `getById`, `create`, `update`, `remove`, plus
      the category-link and attachment sub-repos. In-memory twin for unit tests.
      **Test:** every filter/sort/page combination against the in-memory twin.
- [ ] **P.5** `src/lib/domain/products/list-query.ts` — **pure** parse of `URLSearchParams`
      → a validated `ProductListQuery` (defaults, clamps, unknown values ignored) and back.
      **Test:** garbage input, page overflow, sort injection attempt.
- [ ] **P.6** `src/lib/domain/products/operations/save-product/` — `invariants.ts` (name
      non-empty, price ≥ 0, slug/sku unique, ≤ 20 attachments, exactly-one primary) and
      `controller.ts` (partial-application DI over the repos + clock + id).
      **Test:** each invariant violation returns its tagged error; the happy path writes
      product + links + attachments once.
- [ ] **P.7** `src/lib/domain/products/operations/delete-product/` — same shape.

## U — Dashboard UI (AC-2 … AC-6)

- [ ] **U.1** `(dashboard)` shell — sidebar (Products · Categories), header with theme
      toggle + user menu, breadcrumb, mobile drawer.
- [ ] **U.2** `/products` — server-rendered table reading P.5's query from `searchParams`;
      `FilterSelect` + debounced `SearchInput` + `SortSelect` + `Pagination`, all pushing to
      the URL; `loading.tsx` skeleton; distinct empty vs no-match states.
- [ ] **U.3** `ProductForm` (shared by new + edit) — react-hook-form + zod via
      `standardSchemaResolver`, slug auto-derive with manual override, category multi-select,
      pending button convention (spinner icon, label unchanged, `aria-busy`).
- [ ] **U.4** `AttachmentsField` — drag-drop zone, per-file progress, per-file error,
      thumbnail grid, dnd-kit reorder **with a keyboard fallback**, alt-text editing,
      "view original" link, primary-image marker.
- [ ] **U.5** `/products/new` + `/products/[id]` wiring the save/delete server actions,
      `revalidatePath`, toast feedback, and an archive/delete confirm dialog.
- [ ] **U.6** `/categories` — table + inline create/rename + delete confirm showing the
      affected product count.

## T — Verification (AC-9)

- [ ] **T.1** Playwright smoke: sign in via the bypass → create a product with one image →
      find it via search + status filter → open it → rename → assert the list reflects it.
- [ ] **T.2** README: what it is, the two driver modes, the three-command local start, the
      env table, and the four gates.
- [ ] **T.3** ↷ Lighthouse pass on `/products` (Performance ≥ 90, Accessibility ≥ 95).

## L — Later (explicitly deferred, not forgotten)

- [ ] **L.1** Orphan-blob sweep on product/attachment delete.
- [ ] **L.2** Postgres full-text search behind the same `list()` method.
- [ ] **L.3** Server-side video transcode if bandwidth justifies it.
- [ ] **L.4** Variants + inventory (needs its own spec).

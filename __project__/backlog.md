# Backlog — TDD-ordered task list

> Each leaf task is **red → green → refactor → commit**, atomic, one Conventional
> Commits type per commit. Move completed lines to [`done.md`](done.md) (newest at
> top) with the date and short commit SHA.
>
> **Shipped work lives in [done.md](done.md) (write-once). This file holds ONLY
> open items.**
>
> Gates for every ticket — see [dev-workflow.md §Quality bar](../dev-workflow.md#quality-bar):
> `bun run lint` · `bunx tsc --noEmit` · `bun run test:coverage` · `bun run build`.
>
> Spec: [`spec.md`](spec.md). Status legend: pending · ↷ stretch · ⏸ blocked

---

## v1 · v1.1 → ✅ **SHIPPED 2026-08-28**

Ship facts in [`done.md`](done.md). What follows is what v1 deliberately left.

## N — Next, in the order it is worth doing

- [ ] **N.0** ↷ **Infinite scroll on `/gallery`.** It pages at 60 with a
      pager, which is consistent with `/products` and linkable. A photo
      library is scanned rather than read, so continuous loading may suit it
      better — but that trades away the bookmarkable URL, so it is a product
      call rather than an obvious upgrade.
- [ ] **N.1** ↷ **Lighthouse pass on `/products` and `/gallery`** (Performance ≥ 90,
      Accessibility ≥ 95 — the quality bar's last unverified line). The list is
      server-rendered with no client data fetching, so the likely findings are
      image sizing on the thumbnail column and contrast on the status badges.
- [ ] **N.2** **Orphan-file sweep.** Deleting a product leaves its uploaded
      bytes behind (deliberate — a best-effort delete half-succeeds on a
      network blip and leaves rows pointing at files that are _sometimes_
      gone). Decide between a reference-counted delete and a sweep job when a
      second feature also uploads. Same question covers files uploaded into a
      product form that was then abandoned.
- [ ] **N.3** **Deploy path.** Provision Neon + Vercel Blob, set
      `DATABASE_URL` / `BLOB_READ_WRITE_TOKEN`, migrate the remote branch
      (the runner refuses a Postgres target without `--allow-remote`), and
      register the Google OAuth client. The seams are
      built and unit-tested; **neither has been exercised against the real
      services**, so budget for the first-run surprises rather than treating
      this as configuration.
- [ ] **N.4** **CI secret decision.** `ci.yml` runs the integration project
      against scratch SQLite with no secret, which is genuinely useful — but it
      means **the Postgres dialect is never exercised in CI**. Either add
      `DATABASE_TEST_URL` against a Neon `test` branch, or state in the
      workflow that Postgres is covered only by the deploy.

## L — Later (explicitly deferred, not forgotten)

- [ ] **L.1** **Postgres full-text search** behind the same `list()` method.
      `searchText LIKE '%…%'` cannot use a btree index for a leading wildcard;
      at a few thousand rows that is fine, past that it is a scan. `pg_trgm` or
      a `tsvector` column is the upgrade, and it is local to one repository
      method.
- [ ] **L.2** **Server-side video transcode** if bandwidth justifies it. v1
      stores video bytes as uploaded and only derives a poster. An `ffmpeg`
      step needs its own decision about where it runs (a queue, not a request).
- [ ] **L.3** **Variants and inventory** — options, per-variant SKU/price/stock,
      stock movements. Needs its own spec; roughly doubles the schema and every
      form.
- [ ] **L.4** **Category tree UI.** `categories.parentId` ships unused and v1
      renders one flat level. The column is there so this needs no migration.
- [ ] **L.5** **i18n (en + vi).** English-only was a v1 decision. Strings stay
      grouped per feature, so the `messages.ts` retrofit is mechanical — but the
      catalogue's operators are Vietnamese-speaking, so this is a _when_.
- [ ] **L.6** ↷ **Bulk actions** — multi-select on the list for status changes
      and category assignment. Wanted the first time someone archives twenty
      products one at a time.
- [ ] **L.7** ↷ **Audit trail.** v1 is not event-sourced by design, so there is
      no record of who changed a price. A plain `product_revisions` table would
      cover the actual need without reopening that decision.

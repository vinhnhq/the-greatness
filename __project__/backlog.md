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
> Specs: [`specs/`](specs/) · decisions: [`decisions/`](decisions/README.md)
> · lessons: [`retro.md`](retro.md). Status legend: pending · ↷ stretch · ⏸ blocked

---

## v1 · v1.1 → ✅ **SHIPPED 2026-08-28**

Ship facts in [`done.md`](done.md). What follows is what v1 deliberately left.

## v2 → ✅ **SHIPPED 2026-08-28**

Ship facts in [`done.md`](done.md). What v2 deliberately left:

- [ ] **V2.7** ↷ **Paging or search in the library picker.** It loads one page
      (60) and stops. A real catalogue will make it obvious which of the two
      it needs; guessing now means building the wrong one.
- [ ] **V2.8** ↷ **Bulk attach from the gallery.** Selection mode can delete;
      "add these six to a product" is the natural other verb, and needs a
      product picker that does not exist yet.
- [ ] **V2.10** ↷ **Record the pre-resize dimensions.** When the stored
      original is a 4096px re-encode, the row keeps only the stored size. The
      upload card says "resized from …" at the time and nothing does
      afterwards. Two nullable columns would let the gallery say it too.
- [ ] **V2.11** ↷ **Server-side derivation from the archive copy.** Now that
      the archive is a known, bounded 4096px file, deriving further sizes
      (thumbnails, a 800px card image) server-side becomes cheap and
      predictable in a way it was not against arbitrary originals.
- [ ] **V2.9** **Replace a file in place.** Today swapping a photo means
      uploading the new one and unlinking the old one on every product using
      it. A library is where "replace" starts being expected.

## v4 — The catalogue gets a shape

Spec: [`specs/v4-taxonomy-and-sync.md`](specs/v4-taxonomy-and-sync.md).
**Blocks A, B and C shipped 2026-09-01** — ship facts in [`done.md`](done.md).
Superseded `N.8` and `L.4`; absorbed `N.6`.

### D · Propose — open

The only part with an LLM in it, and the only part that is not just cloning
Sapo into this app. A–C stand on their own without it.

- [ ] **V4.14** **Proposals table.** The one place v4 needs schema: product,
      suggested category, confidence, reason, state. Migration `006`,
      append-only, backfills nothing (new table).
- [ ] **V4.15** **Classifier over the signals that exist** — `vendor`
      (cleanest: Tefal 357, Philips 69, Fujihome 52), `product_type` (12
      coarse codes, SDA 329 / CW 198 / FAN 87 …) and the product name.
      **`tags` is empty on all 832 products** and cannot be used.
- [ ] **V4.16** **Accept / reject in the UI.** Nothing applies unattended, and
      nothing reaches Sapo. `V4.15` without this is the bug that put 8 fans in
      11 categories.

### Follow-ups the shipped work exposed

- [ ] **V4.18** **Where does an operator file an Unfiled category?** The sync
      brings a new Sapo category in with a null parent and `/categories`
      renders it at the top level, which is honest but not actionable — there
      is no way to place it. The spec's open question, now real.
- [ ] **V4.19** ↷ **Re-parent, rename and merge in the tree view.** v4 seeds
      the tree and owns it; it cannot yet edit its shape. `V4.18` is the
      smallest useful slice of this.
- [ ] **V4.20** ↷ **Decide whether the sync runs on a schedule.** It is
      manual today, deliberately: a cron implies nobody reads the report, and
      the reconciliation is one day old. Revisit once it has run a few times
      against real drift.

### ⊘ Blocked on a decision, deliberately

- [ ] **V4.17** ⏸ **Write-back to Sapo.** `POST /admin/collects.json` works
      and is authenticated as a private app; Collects 422 on smart
      collections. It also inverts the system-of-record relationship, and this
      store pushes to Lazada, Shopee, Tiki, TikTok Shop and Google Shopping —
      a bad write does not stay in one place. **Needs an ADR first, and the
      answer may be no.**

## v5 — Sharper pictures, and a catalogue you can walk

Spec: [`specs/v5-pictures-and-walking-the-catalogue.md`](specs/v5-pictures-and-walking-the-catalogue.md).
No migration. Four independent sections — **A** pays off first and **D** is
the smallest.

### A · Pictures — serve the original, size it on demand

- [ ] **V5.1** ⚠️ **Verify `next/image` optimizes `/uploads/[...key]`.** A
      spike, not a feature, and **the whole section rests on it**: if the
      local route cannot be derived from, serving 216.7 MB of origins takes a
      60-tile gallery page from ~1.5 MB to ~17 MB and A is a different plan.
      Blob has a `remotePatterns` entry; the local route has nothing.
- [ ] **V5.2** **Re-sync the originals.** `fetch:sapo --images` →
      `prepare:sapo-media` → **`sync:sapo`**, never `seed` — the seed wipes
      five tables and would take the v4 tree with it. Record what moved.
- [ ] **V5.3** **`mediaSrc()` returns the archive copy for images.** One `??`
      in `media/entity.ts:53`. Video keeps its poster. The display variants
      stay written and stored; this changes what is _served_, and that
      reversibility is the point.
- [ ] **V5.4** **Drop `unoptimized` from `next/image`.** Currently set in
      `products-table.tsx`. This is what makes V5.3 affordable — a 40px
      thumbnail and a full-screen view stop sharing one 1600px file.
- [ ] **V5.5** **Record page weight before and after** for `/products` (25
      rows) and `/gallery` (60 tiles). A regression here means V5.4 is not
      working, and that is the bug rather than a tradeoff.
- [ ] **V5.6** ↷ **Show the 153.** Only 153 of 786 origins exceeded the 1600px
      cap, so they are the only rows where detail was genuinely discarded —
      the before/after worth looking at. Median quality today is already
      43.8 dB PSNR, so the honest claim is "strictly better and now free",
      not "the old ones were broken".

### B · Walking the catalogue

- [ ] **V5.7** **`/categories/[slug]`** — breadcrumb of ancestors, child
      categories with counts, and the products in this category. Every level
      linkable, consistent with `/products` keeping filters in the URL.
- [ ] **V5.8** **Counts stay distinct at every level**, reusing
      `buildCategoryForest`. Eight fans in nine fan categories are eight; a
      summed count says eighty and the drill-down would repeat the error at
      every step.
- [ ] **V5.9** **An empty branch reads as empty, not broken.** Only 20 of 211
      categories hold anything and all of CÔNG NGHỆ & PHỤ KIỆN is empty, so
      this is the common case, not the edge one.
- [ ] **V5.10** **E2E for the drill-down.** It is a navigation feature; that
      is what e2e is for.

### C · The UI/UX pass

- [ ] **V5.11** **The no-image placeholder is a broken-image glyph.** 63 of
      832 products have no photograph and each shows lucide `ImageOff`, which
      reads as _failed to load_. It is the most common "error" on the list and
      it is not an error.
- [ ] **V5.12** **Rows with several categories are twice the height.** Three
      chips stack and the list loses its rhythm.
- [ ] **V5.13** **The survey itself** — every route at 1440px and 390px, both
      themes, and fix what it finds. V5.11 and V5.12 came from fifteen
      minutes; the task is the walk, not those two.
- [ ] **V5.14** ~~`N.1`~~ **Focus states and badge contrast** — Lighthouse
      Performance ≥ 90, Accessibility ≥ 95. The quality bar's last unverified
      line, done here rather than deferred a third time.

### D · Borderless tables

- [ ] **V5.15** **Drop the row rules** from `components/ui/table.tsx` —
      `border-b` on `TableRow` and `[&_tr]:border-b` on the header. One
      component, four consumers.
- [ ] **V5.16** **Keep it scannable without them.** Row height, hover and
      header weight have to carry what the lines carried. Watch the 211-row
      category tree hardest: it is the one table where a row's depth matters,
      and it may need to keep something the flat lists do not.

## N — Later, unrelated to v2

- [ ] **N.0** ↷ **Infinite scroll on `/gallery`.** It pages at 60 with a
      pager, which is consistent with `/products` and linkable. A photo
      library is scanned rather than read, so continuous loading may suit it
      better — but that trades away the bookmarkable URL, so it is a product
      call rather than an obvious upgrade.
- [ ] **N.1** ↷ **Lighthouse pass on `/products` and `/gallery`** (Performance ≥ 90,
      Accessibility ≥ 95 — the quality bar's last unverified line). The list is
      server-rendered with no client data fetching, so the likely findings are
      image sizing on the thumbnail column and contrast on the status badges.
- [ ] **N.2** **Orphan-file sweep.** Deleting from the library removes the
      row and its links but leaves the bytes (deliberate — a best-effort
      delete half-succeeds on a network blip and leaves rows pointing at files
      that are _sometimes_ gone). v2 makes this more visible, not worse: an
      asset uploaded in the gallery and never attached is now a first-class
      state with its own filter, so the sweep has a clear definition of what
      it may collect — a stored file with no `media_assets` row.
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
- [ ] **N.7** ↷ **`/gallery` loads 60 full display images at once.** With
      generated 450px squares that was instant; with 60 real 1600px WebPs it is
      visibly progressive. A thumbnail variant (`V2.11` is the server-side
      derivation this needs) or lazy loading below the fold would fix it.

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
- [ ] **L.5** **i18n (en + vi).** English-only was a v1 decision. Strings stay
      grouped per feature, so the `messages.ts` retrofit is mechanical — but the
      catalogue's operators are Vietnamese-speaking, so this is a _when_.
- [ ] **L.6** ↷ **Bulk actions** — multi-select on the list for status changes
      and category assignment. Wanted the first time someone archives twenty
      products one at a time.
- [ ] **L.7** ↷ **Audit trail.** v1 is not event-sourced by design, so there is
      no record of who changed a price. A plain `product_revisions` table would
      cover the actual need without reopening that decision.

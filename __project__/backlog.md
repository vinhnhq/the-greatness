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
**V5.1–V5.13, V5.15 and V5.16 shipped 2026-09-01** — ship facts in
[`done.md`](done.md). What is left:

- [ ] **V5.14** ~~`N.1`~~ **Lighthouse: Performance ≥ 90, Accessibility ≥ 95.**
      The quality bar's last unverified line, and still unverified — no
      Lighthouse binary was available in the session that did the rest, so the
      score was not measured rather than assumed. Focus states were checked by
      tabbing and are visible; badge contrast was eyeballed in both themes.
      Needs `npx lighthouse` against a production build.
- [ ] **V5.6** ↷ **Show the 153.** Only 153 of 786 origins exceeded the old
      1600px cap, so they are the only rows where detail was genuinely
      discarded. A before/after worth looking at now that the archive is what
      gets served — but the win is already measured, so this is illustration
      rather than evidence.
- [ ] **V5.17** ↷ **Drop the display variants.** `mediaSrc` no longer serves
      them and `next/image` derives from the archive, so the 19.4 MB of 1600px
      WebPs is now dead weight — `prepare:sapo-media` and the browser uploader
      still write them. Deliberately left until the new path has run for a
      while, because deleting them is the one irreversible step.
- [ ] **V5.18** ↷ **The gallery viewer's footer is dense.** At 1440px the alt
      text, the dimensions, the product chips and the Original link compete;
      narrower it will be worse. Found during the survey, left alone because
      the fix is a layout decision rather than a bug.

## v6 — Two versions of the truth, reconciled on purpose

Spec: [`specs/v6-two-versions.md`](specs/v6-two-versions.md).
**V6.1–V6.14 shipped 2026-09-02** — ship facts in [`done.md`](done.md).
What is left:

- [ ] **V6.15** ⏸ **Push a reviewed selection to Sapo** via the admin API
      (`POST /admin/collects.json`, `PUT /admin/custom_collections/{id}.json`,
      `PUT /admin/products/{id}.json`) as a private app, dry run first.
      `/reconcile` already shows the selection this would send. **Not
      computer-use** — that admin was measured stalling past 30s on detail
      pages, cannot be dry-run, reports nothing, and runs as the operator's
      own login against a store that also feeds Lazada, Shopee, Tiki, TikTok
      Shop and Google Shopping. **Needs an ADR first** (`0004`; `0003` is the mirror), and the answer may
      still be no.
- [ ] **V6.16** ↷ **An append-only change log on our side** — `(entity, id,
field, from, to, actor, at)`. The part of the event-sourcing idea worth
      keeping; supersedes `L.7`. Additive. Note the asymmetry: only **our**
      side can have history.
- [ ] **V6.17** ↷ **Per-member conflict resolution for memberships.** Set
      merges provably cannot conflict — a member is present or absent, so
      exactly one side can have moved it — so this is only needed if a future
      field is a set that _can_.
- [ ] **V6.18** ↷ **Undo for a drag.** The move is optimistic and reversible
      by dragging back, but there is no ⌘Z. `V6.16` is the honest way to get
      one.
- [ ] **V6.19** ↷ **`--plan` fetches the snapshot rather than the network.**
      Stated as fetching fresh in the spec; implemented against `data/sapo/`,
      because a second fetch path would duplicate `fetch:sapo` and the run is
      already a real transaction. Run `fetch:sapo` first for a plan about
      today.

## v7 — The taxonomy workspace, and the 697

Spec: [`specs/v7-taxonomy-workspace.md`](specs/v7-taxonomy-workspace.md).
**Planned 2026-09-02, nothing built yet.** The number that shapes it: **697 of
832 products are filed nowhere**, and **191 of 211 categories are empty**.
Filing is the job; drag is not how you do it 697 times.

**Block A — tabs, and Categories goes flat**

- [ ] **V7.1** `?tab=taxonomy|categories` on `/categories`, `Tabs` shell,
      Taxonomy default. URL state for the same reason `?category=` is —
      linkable, survives a reload.
- [ ] **V7.2** Flat Categories tab: `Name · Path · Slug · Products · Sapo · ⋯`.
      **Path** (`Điện gia dụng › Nhà bếp › Nồi`) comes from the existing
      `ancestorNames` and is what Sapo's own flat list cannot give you.
- [ ] **V7.3** Delete the hierarchy from `categories-table.tsx` — the tree
      lives in Taxonomy now. Net deletion from a 424-line file; check its
      tests before, not after.

**Block B — spacing, and the overlap**

- [ ] **V7.4** **The overlap is the ring.** `ring-1 ring-primary/40` is an
      *outer* box-shadow, so with zero vertical gap one row's highlight paints
      over its neighbour. `ring-inset`, and indent guides move from
      `self-stretch` siblings (fighting the row's `h-7`) to one
      `absolute inset-y-0` layer.
- [ ] **V7.5** Row rhythm ~28px → ~34px. VS Code's 22px is a mouse-only
      surface; this one is dragged on and tapped.
- [ ] **V7.6** Verify in the browser at **1280×800** (the laptop this came
      from) and 1440, both themes. A light-theme-only bug has been found here
      before — see `retro.md`.

**Block C — products in the tree**

- [ ] **V7.7** One read for `id, name, sku, status` per product. **No media
      join** — a prefix icon, not a thumbnail. Measure the RSC payload; ~80 KB
      expected for 832 names.
- [ ] **V7.8** Product leaves in `buildCategoryForest`. Keys are
      `${categoryId}:${productId}` — a product in 11 categories appears 11
      times and that is correct. It is also why the menu says *Remove from
      this category*, never *Delete*.
- [ ] **V7.9** VS Code-style icons: `Folder`/`FolderOpen` for categories,
      `Package` for products, muted for a draft.
- [ ] **V7.10** **Unfiled** pseudo-root holding the 697. Computed, not a row:
      cannot be renamed, deleted, or dropped onto.
- [ ] **V7.11** Filter-first rendering: Unfiled caps at 100 with its true
      count; a type-to-filter box scopes the whole tree via the existing
      `filterForest`. **No virtualization** — an unmounted row is not a drop
      target, and Unfiled is exactly where dropping happens.

**Block D — the detail drawer**

- [ ] **V7.12** `?product=<id>`, server-rendered into a slot — the pattern
      `contents` already uses, so the repository stays out of the browser
      bundle and `router.replace` updates props without remounting the tree
      (expand state survives).
- [ ] **V7.13** Persistent right pane at `lg+`, `Sheet` below. One content
      component, two shells.
- [ ] **V7.14** Quick edit, not the whole `ProductForm`: name, slug, SKU,
      price, status, memberships, primary-image preview, *Open full editor →*.
      The media field wants a full page and a filing session never touches it.
- [ ] **V7.15** Category selected → the pane shows its path, direct products,
      rename, Sapo link.

**Block E — the menu (the point of the version)**

- [ ] **V7.16** `ContextMenu` primitive (shadcn, over the installed
      `radix-ui`).
- [ ] **V7.17** Right-click **and** a `⋮` button, same menu. Both: right-click
      is undiscoverable and absent on touch.
- [ ] **V7.18** Category menu — Move to… · Move to top level · Rename · Add
      child · Open in Sapo · Delete.
- [ ] **V7.19** Product menu — Open · File in… · Remove from this category ·
      Open in Sapo.
- [ ] **V7.20** **Move to… / File in…**: a `Command` palette over all 211
      categories with full paths, illegal targets excluded by `planMove` —
      which takes `(id, targetId)` and no coordinates, so no new validation.
      This is what replaces drag on a long list.
- [ ] **V7.21** Keep drag, keep its e2e spec green (`dragOnto` in
      `e2e/category-tree.spec.ts`).

**Block F — bulk filing** (promotes `L.6`, scoped to filing only)

- [ ] **V7.22** Checkbox multi-select in the tree.
- [ ] **V7.23** *File N products in…* through the same picker. Confirmation
      names the count **and** the target: a mis-aimed bulk file touches N rows
      and there is still no ⌘Z (`V6.16`/`V6.18` are the real answer).

**After the gates** — run `bun run sync:sapo --plan`. Filing writes
memberships, and memberships are a merged set; confirm the merge still reports
them correctly rather than assuming it.


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
      products one at a time. **The category-assignment half is now `V7.22`/
      `V7.23`**; what stays here is bulk *status* changes on `/products`.
- [ ] **L.7** ↷ **Audit trail.** v1 is not event-sourced by design and v6
      re-confirmed that (see `specs/v6-two-versions.md` §Why not events). The
      concrete form this takes is now **`V6.16`**, an append-only change log.

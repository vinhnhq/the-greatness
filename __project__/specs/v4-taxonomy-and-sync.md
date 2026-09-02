# v4 — The catalogue gets a shape

**Status:** 🚧 Blocks A, B and C shipped 2026-09-01; block D open. Supersedes backlog
`N.8` and `L.4`, and absorbs `N.6`.

> Written before the work, from a session that measured the live Sapo store
> rather than guessing at it. Every number below was observed on 2026-09-01;
> the ones that decide the design are marked **⊙**.

## Goal

Give the catalogue the structure Sapo cannot hold, and make the 697
uncategorised products visible enough to fix.

Three findings drive this, and nothing here makes sense without them:

- **⊙ Sapo has no hierarchy, at all.** Not a missing feature we can turn on —
  there is no parent field in the collections API, no column in the admin
  list, and no indentation in the product form's category picker. The 3-level
  structure the storefront displays lives entirely in **menu config**, which
  is theme data. `/thiet-bi-gia-dinh` and `/collections/thiet-bi-gia-dinh`
  return byte-identical pages; a "parent" is just a collection a menu item
  sits above, and it holds **0 products** of its own.
- **⊙ 697 of 832 products (84%) are in no category**, and only 20 of the 211
  collections are non-empty. The taxonomy was built out and then not
  populated.
- **⊙ The tree is derivable — once.** The storefront menu markup encodes
  L1→L2 in its panel container ids (`<parent-alias>-<child-alias>-menu`), and
  collection creation order encodes L2→L3. The two agree on 40 of 41 groups
  and reconcile to exactly **6 L1 + 41 L2 + 163 L3 + 1 standalone = 211**.

So `categories.parentId` — shipped unused in migration `002`, whose comment
anticipated precisely this — becomes the column that makes this app hold
something its source of record structurally cannot.

The second half is keeping that true over time: a **deterministic, read-only
sync** from Sapo that refreshes the catalogue without destroying the tree.

## Out of scope

- **Writing anything back to Sapo.** The `Collect` endpoints exist
  (`POST /admin/collects.json`) and would work, but writing inverts the
  system-of-record relationship this project is built on, and the store
  pushes to Lazada, Shopee, Tiki, TikTok Shop and Google Shopping — a bad
  category write does not stay in one place. **This needs an ADR before a
  line of code**, and it is not this version.

  > **Corrected 2026-09-02** — left above as written because it is what was
  > believed. Sapo propagates only **stock and price** to the marketplaces, so
  > a category write does in fact stay in one place; and the claim that this
  > store feeds those channels was never verified. See
  > [ADR-0004's amendment](../decisions/0004-writing-back.md#amendments).

- **An agent applying classifications unattended.** v4 lets an agent
  _propose_; a person accepts. The eight fan products currently filed under
  all eleven fan categories — a rechargeable mini fan under _Quạt trần_
  (ceiling) and _Quạt tháp_ (tower) — are what one unreviewed bulk operation
  already did here.
- **Smart collections.** Sapo supports them; this store uses **zero** (the
  admin's "Loại danh mục → Tự động" filter returns no results, and every row's
  "Điều kiện áp dụng" is `—`). Nothing to mirror. Their existence matters only
  as the reason a Collect write can 422.
- **Re-deriving the tree on every sync.** See AC-3 — the derivation is a
  one-time seed, not a recurring job.
- **Editing the tree's shape from the UI.** v4 seeds it and lets an operator
  file _new_ categories. Renaming, re-parenting and merging are a later
  version.

## Stories / AC

### Owning the tree

- **AC-1** _(derivation)_ A script reconstructs the 3-level tree from the two
  independent sources — menu markup for L1→L2, creation order for L2→L3 — and
  **fails loudly if they disagree** rather than preferring one. Output is
  committed to `data/sapo/` as a reviewable artifact, not computed at seed
  time. It must reconcile to 211 with no category having two parents.
- **AC-2** _(seed)_ `bun run seed` populates `categories.parentId` from that
  artifact. A seeded category knows its parent; the 6 roots have `null`.
- **AC-3** _(ownership)_ **The tree is ours after seeding.** Creation order is
  a one-time reconstruction and is _not_ stable for future additions — a
  category created tomorrow gets the highest id and lands outside its block,
  which would file it under whichever L2 came last. Therefore the sync
  (AC-9) must **never** overwrite `parentId`, and a Sapo category with no
  local parent is **Unfiled**, not auto-placed.
- **AC-4** _(tax rules are not categories)_ `Thuế 8%` and `Thuế 10%` are
  checked on products through the same picker as real categories. The public
  storefront API already excludes them and the admin API does not; any reader
  that touches the admin surface excludes them explicitly. They are
  distinguishable only by name, so the exclusion is a named list, and an
  unrecognised tax-shaped row is a **failure**, not a silent pass.

### Seeing it

- **AC-5** _(tree view)_ `/categories` renders the hierarchy — roots
  expandable to their children, each row carrying its own product count and
  its subtree's. A category with 0 products of its own but 50 beneath it must
  read as such; today every L1 shows 0 and looks broken.
- **AC-6** _(uncategorised)_ `/products` gains an **Uncategorised** filter.
  697 rows is the number this feature exists to move, so it is visible from
  the product list, not buried.
- **AC-7** _(the picker)_ The product form's category field groups by the tree
  and gains a search box. This absorbs backlog `N.6` — but note the bar is
  **Sapo's own admin, which is also flat**: its picker lists _Cảm biến cửa_
  four rows above its parent _Cảm biến & Điều khiển_, with no indentation. A
  grouped picker is an improvement over the source, not parity with it.

### Keeping it current

- **AC-8** _(sync, deterministic)_ A command refreshes products, categories
  and their links from the **public storefront API** — no auth, no browser, no
  LLM. `fetch:sapo` already does the fetching; this adds the reconciliation.
- **AC-9** _(sync, non-destructive)_ It **upserts by `sapoId`**. Today's seed
  is `deleteFrom` on five tables (`src/db/seed.ts:51-55`) — correct for
  seeding and catastrophic as a job, since it would drop the curated tree,
  every media link and every operator edit on each run. A row that vanishes
  from Sapo is **reported, not deleted**.
- **AC-10** _(sync, observable)_ Every run reports what changed: added,
  updated, unchanged, vanished, and newly Unfiled. A sync that silently
  did nothing and a sync that silently did everything must not look alike.

### Proposing

- **AC-11** _(agent proposes)_ An offline task suggests a category for
  uncategorised products from the signals that actually exist — `vendor`
  (cleanest: Tefal 357, Philips 69, Fujihome 52), `product_type` (12 coarse
  codes: SDA 329, CW 198, FAN 87…) and the product name. **`tags` is empty on
  all 832 products** and cannot be used.
- **AC-12** _(a person accepts)_ Proposals land in our database with a
  confidence and a stated reason, and appear in the tree UI for accept or
  reject. Nothing is applied unattended, and nothing reaches Sapo.

## Non-functional

- **No migration.** `categories.parentId` (002) and `categories.sapoId` (005)
  both already exist. If v4 needs a schema change, that is a signal the design
  drifted — except AC-11/12, which need a proposals table and should say so.
- **The four gates** green per task, per `dev-workflow.md`.
- **The tree view is server-rendered.** 211 categories is not a data volume
  problem; it is an information-design one.
- **The derivation is tested against the committed artifact**, so a Sapo theme
  change breaks a test rather than a seed.
- **No new runtime dependency** for the sync. It is a script and a repository
  method.

## Open questions

- **Where does an operator file an Unfiled category?** The tree view is the
  obvious home, but that makes AC-5 read-write and pulls tree editing back
  into scope. A separate Unfiled queue may be the smaller answer.
- **Does the L2/L3 split survive contact with the operator?** The derived
  tree is what the _menu_ says. Whether _Quạt sưởi_ belongs under
  _Sưởi ấm_ or _Quạt & Thiết bị làm mát_ is an editorial call the menu
  already made, possibly by accident — the 8-fans-in-11-categories data
  suggests the menu is tidier than the assignments.
- **Should the sync run on a schedule at all, or on demand?** A cron implies
  nobody is watching the report AC-10 produces. Manual-first may be honest
  until the reconciliation has been trusted a few times.
- **What is the confidence threshold worth showing?** A proposal an operator
  rejects nine times in ten is worse than no proposal. This needs a
  measurement after AC-11, not a guess before it.
- **⊘ Deferred, deliberately:** whether write-back to Sapo ever happens. See
  Out of scope — it is an ADR, and the answer may be no.

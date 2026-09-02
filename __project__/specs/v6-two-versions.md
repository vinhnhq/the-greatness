# v6 — Two versions of the truth, reconciled on purpose

**Status:** ✅ Shipped 2026-09-02 except `V6.15` (push-back, ADR-gated). Follows
[v5](v5-pictures-and-walking-the-catalogue.md).

> Decided before writing: **not event-sourced.** `L.7` already records that
> "v1 is not event-sourced by design", and the reason holds here — see
> [Why not events](#why-not-events). The audit half of that idea returns as a
> follow-up, not as an architecture.

## Goal

Let an operator change things here without the next sync undoing them, and
make what diverged from Sapo visible enough to act on.

Everything in this version follows from one fact: **Sapo emits no events.**
There is no webhook, no change feed — only `/products.json`, polled. So the
only way to know what Sapo changed is to diff today's payload against the last
one we saw, which means storing it. That store is the mirror, and it turns the
sync from a two-way overwrite into a three-way merge:

```
base   = sapo_mirror    what Sapo said at the last sync
theirs = incoming Sapo  what it says now
ours   = the live row   what the operator edited
```

| ours vs base | theirs vs base | Outcome                         |
| ------------ | -------------- | ------------------------------- |
| same         | same           | nothing                         |
| same         | changed        | take theirs — automatic         |
| changed      | same           | **keep ours** — automatic       |
| changed      | changed        | **conflict** — a person decides |

The third row is the one that does not exist today, and it is why a category
dragged into a new place currently survives only until the next `sync:sapo`.

**Only the fourth row asks a person anything.** A review that presents all 832
rows for approval is rubber-stamped by the third run and stops being a review.
The run reports all four counts so it is legible; it _asks_ about conflicts.

### The two diffs have opposite defaults

They are easy to conflate and must not share a UX:

|            | **Inbound** (Sapo → us) | **Outbound** (us → Sapo)               |
| ---------- | ----------------------- | -------------------------------------- |
| Frequency  | often, schedulable      | rare, deliberate                       |
| Asks?      | only on conflict        | **always**, every time                 |
| Reversible | re-fetch                | **no** — fans out to five marketplaces |
| Task       | A and B                 | `V6.15`, ADR-gated                     |

### A conflict is a record, not a modal

A plan is a snapshot of a moment. "Fetch → show the diff → decide now →
apply" means whatever time review takes is time Sapo can move, and applying a
plan computed against a state that no longer exists is how something gets
overwritten that nobody saw.

So the sync applies the three automatic buckets and **parks** conflicts as
rows carrying base, ours and theirs. The sync never blocks on a human, so it
stays safe to schedule; conflicts accumulate and are resolved whenever; and
re-running re-checks a parked conflict against fresh data rather than trusting
an old plan.

## Out of scope

- **Event sourcing.** See below. The append-only change log — the part of that
  idea worth having — is `V6.16`, additive, and lands after this.
- **`react-window`.** Measured: 211 categories at depth 3, largest category
  pane 50 products. Virtualization buys nothing at that size and actively
  fights drag-and-drop (a drop target that is unmounted is not a drop target).
  Revisit past a few thousand nodes.
- **`react-arborist` and the shadcn tree-view.** Reviewed 2026-09-02.
  Arborist pins `react-dnd ^14.0.3` (published 2022-01-02, one major behind
  react-dnd's own latest) and would be a **second** drag engine beside the
  `@dnd-kit` already in this project and already proven under React 19 in
  `media-field.tsx`. The shadcn component's drag is native HTML5
  `dataTransfer`, which does not work on touch at all. Both render their own
  rows, so the borderless table, indent rail, counts and Sapo links would be
  rebuilt inside their renderer.
- **A root client store.** Tree state is scoped to the `/categories` segment.
  Selection stays in the URL, as `/products` does.
- **Writing to Sapo** — still gated. `V6.15` is the first task that would, and
  it needs the ADR first.

## Why not events

Three reasons, in the order they decide it:

1. **You would still need the mirror.** Merging two logs requires two logs;
   Sapo has none and never will. Their "events" can only ever be derived by
   diffing against a stored previous state. Event sourcing does not replace
   the mirror — it adds a log beside it, plus projections, because no page can
   fold 832 products per request.
2. **Rebase does not resolve conflicts, it relocates them.** "We renamed a
   category and so did Sapo" is a conflict in both designs. Replaying our ops
   onto a new base needs the same policy the merge function needs — written in
   a harder place to test, over sequences instead of over a triple.
3. **The cost lands on every write path.** `save-product`'s controller and
   invariants, category CRUD, media links, the seed and the sync would all
   have to emit. That is a large change to `lib/domain/` in exchange for logic
   that has to be written either way.

What events would genuinely buy — attribution, undo, "what did the agent
propose" — is bought far more cheaply by `V6.16`, and only for **our** side.
Sapo's history is unobtainable regardless.

## Stories / AC

### A · The mirror and the three-way merge

- **AC-0** _(no backfill, deliberately)_ Seeding the mirror from current local
  rows would assert "Sapo said this" about every row — false for any row
  already edited here, which is the exact population this protects. An absent
  base is honest; AC-6 handles it.
- **AC-1** _(one table, no read churn)_ Migration `006` adds `sapo_mirror`
  (`entity`, `sapoId`, `payload` JSON, `syncedAt`; PK `entity + sapoId`).
  `products` and `categories` stay the **effective** rows, so no page,
  component or repository read changes. This is the whole reason to mirror
  rather than double every column into `name` / `sapoName`.
- **AC-2** _(memberships are mirrored too)_ A product's payload carries its
  sorted category `sapoId`s. Membership is the field drag-and-drop writes
  most, so it is the one that most needs a base — and as a set, its merge is
  add/remove per side rather than a scalar comparison.
- **AC-3** _(three-way `planSync`)_ `planSync(local, remote, diff)` grows a
  `base` argument and returns the four outcomes above. Still pure, still
  tested without a database — the shape is the reason not to go event-sourced.
- **AC-4** _(keep ours, automatically)_ A row the operator changed and Sapo
  did not is **left alone**, and the report says so. Today it is silently
  overwritten.
- **AC-5** _(a conflict is recorded, not just reported)_ Both sides changed
  means neither wins by default. The sync applies the other three buckets and
  **writes a conflict row** carrying base, ours and theirs. Recording rather
  than reporting is what keeps the sync non-blocking — and therefore
  schedulable — while leaving the decision genuinely open.
- **AC-5b** _(re-running re-checks)_ A parked conflict is re-evaluated against
  fresh data on the next run, not trusted. If Sapo has since moved back to
  our value, the conflict resolves itself and disappears.
- **AC-6** _(first run adopts)_ With no mirror row, `base` is absent — treat
  incoming as authoritative and write the mirror. A catalogue that has never
  synced under v6 must not report 832 conflicts.

### B · Seeing what diverged

- **AC-7** _(dry run, against fresh data)_ `sync:sapo --plan` prints what it
  would do and changes nothing — and **fetches rather than reading
  `data/sapo/`**, because a plan computed from yesterday's snapshot describes
  yesterday. For preview and debugging; inbound safety comes from the mirror
  and parked conflicts, not from someone reading this.
- **AC-8** _(a divergence view)_ A page lists rows where ours ≠ base: what
  changed, when, and from what. This is the selection `V6.15` would push, and
  it is useful on its own before anything is pushed.
- **AC-9** _(conflicts are actionable)_ A conflict shows base, ours and theirs
  side by side, with take-mine / take-theirs. Resolving is an ordinary action
  with its own validation — not a step inside a session that can go stale —
  and it writes the chosen value **and** updates the mirror, or the conflict
  returns on the next run.

### C · The split view, with drag and drop

- **AC-10** _(no navigation)_ `/categories` becomes tree-left, contents-right.
  Selecting a category fills the right pane; it does not navigate. The
  drill-down route from v5 stays as the linkable deep view.
- **AC-11** _(selection lives in the URL)_ `?category=<slug>`, so a branch is
  still linkable and shareable — consistent with `/products` keeping filters
  in the URL.
- **AC-12** _(drag to re-parent)_ Dragging a category onto another sets
  `parentId`. Built on `@dnd-kit`, already in the project. The projection —
  target depth and parent from the drag offset — is a **pure function of
  (flattened tree, activeId, offset)** and is tested like
  `buildCategoryForest` is, not by driving a browser.
- **AC-13** _(drag to categorise)_ Dragging a product onto a category writes
  `product_categories`. **This only becomes safe once A ships** — without a
  base the next sync reverts it, which is the trap this whole version exists
  to remove.
- **AC-14** _(optimistic, and honest when it fails)_ `useOptimistic` moves the
  row immediately; a failed action puts it back and says why. Scoped state —
  expansion, drag-in-flight, multi-select — lives in the `/categories`
  segment, not at the root.

### D · Pushing back

- **AC-15** ⏸ _(gated)_ Push a **reviewed selection** to Sapo through the
  documented admin API — `POST /admin/collects.json`,
  `PUT /admin/custom_collections/{id}.json`,
  `PUT /admin/products/{id}.json` — as a private app, with a dry run first.
  **Not computer-use:** that admin was measured stalling past 30s on detail
  pages, cannot be dry-run, reports nothing, and runs as the operator's own
  login against a store that pushes to Lazada, Shopee, Tiki, TikTok Shop and
  Google Shopping. Browser automation stays the fallback for a field the API
  genuinely cannot reach; none has been found. **Needs its own ADR first** — `0003` is the mirror, so this is `0004`.

## Non-functional

- **One migration** (`006`) adding `sapo_mirror` **and** `sync_conflicts`,
  append-only and with **no backfill** — see AC-0.
- **The four gates** green per task.
- **No new runtime dependency.** `@dnd-kit` is already here; nothing else is
  added.
- **The merge is a pure function.** If reconciliation needs a database to be
  tested, the design drifted.

## Open questions

- **Does the mirror store every field, or only the ones Sapo owns?** Only
  Sapo's, probably — but `status` is ours (the seed invents it) and lives on
  the same row, so the boundary needs stating once rather than per field.
- **What resolves a conflict on a set?** Memberships can conflict partially:
  we added X, they removed Y. Per-element resolution is right and may be more
  UI than it is worth on a first pass.
- **Does a resolved conflict need a record?** `V6.16` would answer it; without
  it, "we chose ours in March" is unrecoverable.
- ~~Should `sync:sapo` refuse to run with unresolved conflicts?~~
  **Answered 2026-09-02: no.** Conflicts are records (AC-5), so the run never
  blocks — which is what makes it safe to schedule. A conflict left unresolved
  costs nothing but stays visible.
- **Where does the divergence view live** — its own route, or a tab on
  `/categories`? It is about products as much as categories, which argues for
  its own.

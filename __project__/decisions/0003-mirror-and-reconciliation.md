# 0003 — The mirror: two versions, reconciled three-way

**Status:** Accepted 2026-09-02. Shipped in v6
([spec](../specs/v6-two-versions.md), migration `006`).

## Context

Sapo is the system of record and this app is a companion view — but v4 gave
the app something Sapo cannot hold at all (the category tree, in
`categories.parentId`), and v5 and v6 gave an operator ways to edit the
catalogue here (a grouped picker, a drag-and-drop split view).

That created a contradiction the two-way sync could not survive. `sync:sapo`
had exactly one rule — Sapo wins — so every local edit lasted until the next
run. A re-parented category, a product dragged into a category: both silently
reverted. The feature and the sync were working against each other.

The decisive constraint on any fix: **Sapo emits no events.** No webhook, no
change feed, only `/products.json` polled. There is no way to ask what changed
upstream; it can only ever be inferred.

## Decision

**Store the payload Sapo last gave us, and merge three-way against it.**

`sapo_mirror` holds one JSON payload per (`entity`, `sapoId`). Every sync then
resolves each field from three values:

```
base   = sapo_mirror    what Sapo said last time
theirs = incoming Sapo  what it says now
ours   = the live row   what the operator edited
```

| ours vs base | theirs vs base | outcome                        |
| ------------ | -------------- | ------------------------------ |
| same         | changed        | take theirs — automatic        |
| changed      | same           | **keep ours** — automatic      |
| (equal)      | (equal)        | nothing                        |
| changed      | changed        | conflict — parked, nobody wins |

Four things follow, and each is load-bearing:

- **A mirror, not doubled columns.** `products` and `categories` remain the
  _effective_ rows, so no page, component or repository read changes. The
  alternative — `name` beside `sapoName` on every syncable field — doubles the
  schema, doubles every future migration, and puts `sapoName ?? name` into
  every read for no reader's benefit.
- **The payload is opaque JSON.** Its shape is Sapo's, nothing queries into
  it, and giving it columns would mean migrating this table every time Sapo
  adds a mirrored field.
- **A conflict is a row, not a modal.** `sync_conflicts` parks the fourth
  case, so the run applies the other three and never blocks on a person —
  which is what keeps it safe to schedule. A plan is a snapshot of a moment;
  "fetch, show, decide now, apply" makes review time a window in which Sapo
  can move, and applying a stale plan overwrites something nobody saw.
- **Ownership is stated.** Sapo owns a product's name, slug, SKU, description
  and price, a category's name and slug, and memberships. This app owns
  `categories.parentId` — which Sapo has nowhere to store — and everything
  media. The sync never writes either.

### Not event-sourced

Considered seriously and rejected; `L.7` already recorded that v1 is not
event-sourced by design, and this re-confirms it.

1. **The mirror would still be needed.** Merging two logs requires two logs.
   Sapo has none, so their changes can only be derived by diffing a stored
   snapshot. Events would add a log _beside_ the mirror, plus projections,
   because no page can fold 832 products per request.
2. **Rebase relocates conflict policy, it does not supply one.** "We renamed
   it and so did Sapo" is a conflict in both designs. Replaying our operations
   onto a new base needs the same rules the merge needs, written somewhere
   harder to test — over sequences instead of over a triple.
3. **The cost lands on every write path.** `save-product`, category CRUD,
   media links, the seed and the sync would all have to emit.

What events would genuinely buy — attribution, undo, "what did the agent
propose" — is bought far more cheaply by an append-only change log on **our**
side (`V6.16`). Only our side can have history; Sapo's is unobtainable
whatever we build.

## Consequences

**Good.** Local editing became safe, which is what let the drag-and-drop split
view exist at all. Verified against the real catalogue: a renamed category, a
renamed product and a dragged membership all survive `sync:sapo`, reported as
"kept ours". `/reconcile` can show what diverged, which is also the selection
a future push to Sapo would send.

**Costly.** Two extra tables, and a sync that is materially harder to reason
about than "Sapo wins". Two bugs in the first implementation prove the point,
and both were found by running the app rather than by tests:

- The mirror must **not** advance past a conflicted field. Writing Sapo's new
  value while a conflict was open made the next run read it as keep-ours, so
  the parked decision silently resolved itself one run later.
- Resolving a conflict must record **theirs** as the new base, never the
  chosen value. A base equal to our value made the next sync read Sapo's
  _unchanged_ value as an upstream change and overwrite the decision.

Both are now comments, tests and `CLAUDE.md` gotchas. The general shape is
worth remembering: **a pointer to "what we last saw" must not move past
something undecided.**

**Deferred.** Writing anything back to Sapo is still gated — that is a
separate decision (see `V6.15`) and the answer may be no.

**Unchanged.** Sapo remains the system of record. This decision does not make
the app a second writer; it makes the app able to hold an opinion without
losing it.

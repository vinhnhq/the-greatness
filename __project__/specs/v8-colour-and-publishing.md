# v8 — Colour that means something, and a way out to Sapo

**Status:** 📝 Planned 2026-09-02. Follows
[v7](v7-taxonomy-workspace.md). Block A is independent and ships on its own;
Blocks B–D implement [ADR-0004](../decisions/0004-writing-back.md).

## Goal

Two unrelated things, deliberately in one version because they are what is
next and they do not touch each other.

**A.** Move colour to where the data varies.
**B–D.** Let a reviewed change reach Sapo.

---

# Part one — colour

## What is wrong today

The app is entirely achromatic: every token is `oklch(x 0 0)`, zero chroma.
That is the right instinct for a tool whose content is 786 product
photographs — the chrome should not compete with them — and it should stay.
Three semantic tokens exist (`--destructive`, `--success`, `--warning`) and
they are used in **exactly one component**.

The problem is not the amount of colour. It is where it is:

```
status:          832 of 832 products are "active"   ← the only coloured column
no category:     697                                ← grey
no description:  299                                ← grey
no price:        160                                ← grey
no image:         63                                ← grey
```

**Colour is spent on the one column with no variance.** Twenty-five identical
green pills per page, telling the reader nothing and training them to skip
that column, while the four facts that actually vary are rendered in the same
grey as everything else.

`/reconcile` has the same fault in a different shape: **"Needs a decision"**
and **"Changed here since the last sync"** mean opposite things — ADR-0003
says their defaults are opposite — and they look identical.

## The rule

**Colour encodes state or ownership, never decoration.** Two corollaries,
both of which the current design breaks:

- **Do not colour a constant.** If every row has the same value, the colour is
  noise. `active` becomes the quiet default.
- **Do not colour a majority either.** 697 of 832 products are unfiled;
  marking 84% of rows amber is the same mistake in reverse. **Mark the
  minority, aggregate the majority** — one amber badge on the Unfiled node
  saying `697`, not 697 amber rows.

And: colour is never the only signal. Every mark below sits next to a word or
a number, so the page still reads with colour removed.

## The palette

Keep the neutral ground. Four semantic roles, each with one job:

| token              | hue   | means                      | where                                        |
| ------------------ | ----- | -------------------------- | -------------------------------------------- |
| `--destructive`    | red   | destroys something         | delete, an unresolved conflict               |
| `--warning`        | amber | **incomplete — your move** | Unfiled's count, no price, no image, `draft` |
| `--info` **(new)** | blue  | **Sapo's side**            | `SapoLink`, "took theirs", the mirror        |
| `--success`        | green | resolved, kept             | a healed conflict, "kept ours"               |

`--info` is the only new token, and it earns its place because the whole app
is a two-version model with nothing distinguishing _ours_ from _theirs_.

---

# Part two — publishing

Implements [ADR-0004](../decisions/0004-writing-back.md). Read it first; the
reasoning is not repeated here.

## The shape

```
        our tables ─┬─► planPublish(local, mirror) ─► change set ─┬─► summary (for a person)
                    │                                             │
             sapo_mirror                                          └─► publish_queue
                                                                        │
                                                    ┌───────────────────┴────────────────┐
                                                    ▼                                    ▼
                                          lane 1 · Admin API                   lane 2 · Playwright
                                     collections · collects · products               the menu tree
                                                    │                                    │
                                                    └──────────► read back, diff ◄───────┘
                                                                        │
                                                          the next `sync:sapo` moves the mirror
```

## What each part is

**`planPublish`** is pure, like `planSync` and `planMove` before it: local
rows plus the mirror in, a typed change set out. It is the reviewable
artifact, and it is what both lanes and the summary consume.

**`publish_queue`** is the outbox. One row per item, `pending → applied →
verified → failed`, so a half-finished run resumes instead of redoing or
skipping. Per item, not per run — a 210-item menu rebuild will fail partway.

**Lane one** is a Sapo Admin API client. Basic auth from the environment,
living in a file that does **not** import `env-server.ts` (that carries
`server-only` and throws in any CLI script — the existing readers are
`db-url.ts` and `storage/config.ts`).

**Lane two** is a Playwright script against the admin's menu editor. It runs
outside the request cycle. Whether it is scriptable at all is the first thing
to find out, and `V8.16` is a timeboxed spike, not a promise.

**Read-back** re-fetches from Sapo and diffs against what was intended. Only a
verified item is `verified`. And the mirror is not touched — the next ordinary
`sync:sapo` moves it, having seen the change arrive from Sapo's side like any
other upstream change.

## Out of scope

- Anything on another platform. `N.8` holds that, and
  [the research](../research/write-back-and-other-platforms.md) says the
  Shopify version of this problem is already served.
- The metafield-and-theme route. ADR-0004 records why it is parked.
- Scheduling. A publish is triggered by a person clicking a button, this
  version. A cron over an unattended outward write is a separate decision.
- Undo. `V6.16` is still the honest answer, and it now matters more.

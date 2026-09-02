# Writing back, and what other platforms do — research

**Researched 2026-09-02. Not a decision.** The decision this feeds is
`ADR-0004` / `V6.15`, which is still open and may still be "no".

**This document ages.** Shopify changed its collection model seven weeks
before this was written; assume anything here about a third party may be stale
and re-check before acting on it. Everything marked **verified** was read from
the vendor's own docs or measured against the live store on the date above.

---

## 1 · What Sapo's API can and cannot do

**Verified.** A **Private App** (Apps → Private Apps → Create) issues an API
key and secret, used with Basic auth:

```
https://apikey:apisecret@the-greatness.mysapo.net/admin/<resource>.json
```

Scopes are `read|write_` × `content, themes, products, customers, orders,
script_tags, price_rules, draft_orders`. Each resource is settable to no
access / read / read-and-write.

### What `write_products` buys

|                                                       |                                   |
| ----------------------------------------------------- | --------------------------------- |
| `POST/PUT/DELETE /admin/custom_collections.json`      | create, rename, delete a category |
| `POST/DELETE /admin/collects.json`                    | file and unfile a product         |
| `PUT /admin/products/{id}.json`                       | product fields                    |
| `POST /admin/custom_collections/{id}/metafields.json` | arbitrary key/value on a category |

So **everything v7 does except the tree** is pushable with a key. Filing the
697 unfiled products — the actual job — is fully automatable.

### What no key buys: the tree

Two independent walls, both verified:

- **`CustomCollection` has no hierarchy field.** The documented field list is
  `id · name · alias · description · image · published_on · modified_on ·
sort_order · template_layout · metafield · products_count`. No `parent`, no
  `parent_id`, no `level`.
- **There is no menu API.** In Sapo a menu is a `linklist`, and `linklist` is
  a **Liquid template object**, not a REST resource — properties `alias`,
  `id`, `links`, `title`, all read-only, reached as
  `{% for link in linklists.main-menu.links %}`. Sapo's own docs say
  _"linklist được gọi là Menu trong trang quản trị"_. There is no
  `menus.json`, no `link_lists.json`, no `navigation.json`, and **no OAuth
  scope for menus** — `content` covers posts, blogs, comments, pages and
  redirects.

**Consequence.** `categories.parentId` is not ours _provisionally_, it is ours
**permanently**: Sapo has nowhere to put it. ADR-0003 says the sync never
writes `parentId`; this turns that from a design choice into a property of the
platform.

### The three ways the tree could reach Sapo

1. **Publish by hand.** The operator rebuilds the menu in the admin when it
   changes. Zero risk, and only once per structural change rather than per
   product. This is the status quo and it is not unreasonable.
2. **Drive the admin with computer-use.** Already rejected in `V6.15` and the
   reasons have not changed: that admin was measured stalling past 30s on
   detail pages, cannot be dry-run, reports nothing, and would run as the
   operator's own login against a store that also feeds Lazada, Shopee, Tiki,
   TikTok Shop and Google Shopping.
3. **Metafields plus one theme change.** `CustomCollection` supports
   metafields and themes are writable (`write_themes`). Write each category's
   parent as `namespace: taxonomy, key: parent_id`, then change one Liquid
   snippet to build the menu from those metafields instead of `linklists`. The
   tree we author here would then publish itself, with a key, no computer-use.

   **The cost is real and should not be glossed:** it means editing the
   customer's live theme, and the storefront menu stops being editable from
   Sapo's admin — it becomes ours. That is a support commitment, not a
   feature.

---

## 2 · The same problem on Shopify

**Verified, and the answer reverses the intuition.**

|                      | Sapo                                  | Shopify                                                                                                                    |
| -------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Menu API             | none (`linklist` is read-only Liquid) | **`menuCreate` / `menuUpdate` / `menuDelete` since API 2024-07**, scope `write_online_store_navigation`, **3 levels deep** |
| Collection hierarchy | none, no field for it                 | **native since 2026-07-16** (`CollectionSubCollectionsSource`)                                                             |
| Product ↔ collection | many-to-many                          | many-to-many                                                                                                               |

The pain this project exists to remove — hand-dragging 210 menu links because
Sapo offers no import and no API — **is one mutation on Shopify, and has been
for two years.** That gap is the moat. Porting removes it.

### Shopify's new nesting is narrower than the headlines

From Shopify's own docs: _"Sub-collection chains are restricted to a depth of
one: a sub-collection target can't itself be a sub-collection."_ Shop-wide cap
of **50** collections containing sub-collections; **10** sub-collection
inclusions per source.

Measured against this catalogue:

```
nodes with children:  47   (cap 50)   fits by three
max children:          9   (cap 10)   fits by one
depth:                 3             does NOT fit; the cap is 2
```

So this taxonomy would not fit Shopify's native nesting either. It fits the
**Menu** API — which is the writable one, and is three levels.

### The market is not empty

`TreeNav`, `Collection Tree: Discover`, `Smart Collection Pro`,
`Ultimate Collection Manager`, `Navi+`, and a whole _Navigation and menus_
App Store category. TreeNav's own description — _"organizes collections into
parent-child hierarchies for storefront navigation using a visual
drag-and-drop editor… with customizable labels independent of collection
titles"_ — is this app's Taxonomy tab, shipping today.

### Where a gap does still exist

- **Two trees, unsynchronised, seven weeks old.** Since 2026-07 a Shopify
  store has a _subcollection graph_ (product rollup, depth-1) **and** a
  _navigation menu_ (display, 3 levels). They are unrelated objects and
  nothing reconciles them. Reconciling two versions of a tree is what this
  codebase already is.
- **A live migration window.** Apps on pre-2026-07 API versions cannot _see_
  new-model collections — Shopify filters them out of `collections` queries.
  Every incumbent is mid-migration. That is a window to compete, not an empty
  field, and it closes as they ship.

---

## 3 · Does the mirror-and-merge pattern survive a push?

**Opinion, argued from the code.**

### The merge half transfers, and the argument gets stronger

ADR-0003 justified the mirror with _"Sapo emits no events."_ Shopify does emit
events, so the argument should collapse. It does not:

- **A webhook carries the new state, not the old one.** To know whether _they_
  changed a field or _we_ did, you still need a base. Webhooks tell you _when_
  to sync; only the mirror tells you _what they changed_.
- **The log is lossy.** Shopify webhooks are at-least-once, retried 8 times
  over 4 hours, and — the part that matters — Shopify **does not guarantee
  ordering** within or across topics. A merge that trusts an unordered,
  duplicating feed loses edits silently.

So the design survives contact with a platform that has the thing Sapo lacks.
That is the strongest available evidence that it was not over-fitted.

### The dry run does not transfer

`--plan` is today _"a real run inside a rolled-back transaction"_, and its
best property is that **it cannot lie**. That holds only because every write
is local. Add a push and a rollback undoes the local half and cannot undo the
remote half, so the remote half must be _simulated_ — a prediction, not an
execution. The plan then has two halves of different trustworthiness, which is
how a report stops being read.

This is a genuine downgrade and should be stated rather than papered over.

### The v6 trap returns in a new costume

Today, resolving "keep ours" writes nothing outward — it records theirs as the
new base. With a push, "keep ours" means _send it_, and a send can half-fail.
`retro.md` already has the general rule:

> a pointer to "what we last saw" must not move past something **undecided**

With a push it becomes: must not move past something **unconfirmed**. If the
mirror advances on a write that merely looked successful, the next pull reads
the stale remote value as an upstream change and reverts the decision — the
exact bug that made a category revert in the browser.

**The rule that falls out: a publish never advances the mirror. Only a pull
does.** One extra round trip, one whole class of bug gone.

### One thing that gets better

`menuUpdate` replaces the whole item tree in a single idempotent mutation. A
211-node taxonomy is one call, not 210 writes, and re-running it is free.
Membership is the part that would still need batching.

### Shape, if it is ever built

- **Sync stays read-only.** Pull, merge, park. Unchanged, still
  rollback-testable, still cannot lie.
- **Publish is a separate, explicit, idempotent operation** over a reviewed
  selection — which `/reconcile` already computes.
- **Publish never advances the mirror.**

The thing to actually fear: **bidirectional sync is where projects die.** Sapo
is easy mode because there is exactly one writer. Two writable trees needs an
outbox with retries, idempotency keys and read-back confirmation — a queue,
not a server action, and a bigger build than `/reconcile` was.

---

## 4 · The commercial question

**Opinion, and the least verified section here. Treat it as a starting
position, not a finding.**

The thesis under discussion is _"a central place to do everything is better
for users"_. Two things are true at once.

**The pain is real and first-hand.** This store already publishes to **Sapo,
Lazada, Shopee, Tiki, TikTok Shop and Google Shopping**. That is not a
hypothesis about a market, it is the operator's own week. And the mirror
generalises cheaply — `sapo_mirror` becomes
`channel_mirror(channel, entity, remoteId, payload)`, one column, because each
channel needs its own base. The hard part of multi-channel is conflict
resolution, and that is the part already built.

**But "central place for everything" is the wrong shape to sell.** Three
reasons:

1. **The category is crowded and funded.** Sapo itself sells omnichannel
   (Sapo Omni), alongside Nhanh.vn, KiotViet, Haravan and others. Building a
   central place on top of Sapo means competing with the vendor supplying the
   data.
2. **Single-pane products decay to the lowest common denominator.** You can
   only manage what every channel shares, so the tool is permanently
   feature-poorer than each native admin, and the merchant keeps both open.
3. **Every channel is a treadmill.** Six APIs, six changelogs, permanently
   behind.

**The narrower version is the good one.** Every channel forces a _different_
category scheme — Shopee has its tree, Lazada has its, Google Shopping has a
taxonomy, Sapo has none. A merchant maintains the same 832 products in six
schemes by hand. "**One taxonomy, mapped and published to every channel's
scheme**" is narrow, painful, unsolved, and is what this codebase already is:
a locally-owned tree, a per-channel mirror, a three-way merge, and a place to
decide.

That is a wedge. "Everything in one place" is a category.

**What is not known, and would decide it:** whether merchants pay to remove
this pain or simply tolerate it; how many have enough SKUs for it to hurt;
and whether the channel APIs allow the writes it would need. None of that has
been researched. Do that before writing code.

---

## Sources

Sapo — [Private Apps](https://help.sapo.vn/ung-dung-rieng-private-apps) ·
[OAuth scopes](https://support.sapo.vn/oauth) ·
[CustomCollection](https://support.sapo.vn/customcollection) ·
[Collect](https://support.sapo.vn/collect) ·
[linklist object](https://support.sapo.vn/linklist-object) ·
[Metafield](https://support.sapo.vn/metafield) ·
[Menu cấp 2, 3](https://help.sapo.vn/thiet-lap-menu-cap-2-3-tren-website-sapo)

Shopify — [Menu API changelog (2024-07)](https://shopify.dev/changelog/graphql-admin-api-new-apis-for-menus-are-now-available-in-2024-07) ·
[`menuCreate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/menucreate) ·
[New collection model (2026-07)](https://shopify.dev/changelog/new-collection-model-and-apis-now-available) ·
[Use the new collections model](https://shopify.dev/docs/apps/build/product-merchandising/products-and-collections/use-new-collections-model)

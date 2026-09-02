# 0004 — Writing back: two lanes, and the mirror moves last

**Status:** Accepted 2026-09-02. Supersedes the "may still be no" hold on
`V6.15`. Not yet built — the plan is [v8](../specs/v8-colour-and-publishing.md).

## Context

v6 made local edits survive a sync. v7 made them easy to produce: an operator
can now re-file a product in two clicks and re-shape the taxonomy in a
minute. Neither reaches Sapo. `/reconcile` computes exactly what diverged and
then has nowhere to send it.

The research is in
[`research/write-back-and-other-platforms.md`](../research/write-back-and-other-platforms.md).
Two findings decide this:

- **A Private App key can write almost everything**: `custom_collections`,
  `collects`, `products`, and collection `metafields`. Filing the 697 unfiled
  products — the actual job — is a plain API problem.
- **The category tree cannot be written at all.** Sapo has no menu API: a menu
  is a `linklist`, which is a read-only Liquid template object. And
  `CustomCollection` has no `parent` field. There is no endpoint, and no OAuth
  scope, for either.

So the write-back is not one problem. It is two, with different volumes,
different risks, and different mechanisms — and the mistake available here is
to pick one mechanism for both.

## Decision

**Publish in two lanes, and let a publish never advance the mirror.**

|                                    | changes                            | mechanism                           |
| ---------------------------------- | ---------------------------------- | ----------------------------------- |
| Product ↔ category memberships     | **constantly** — 697 waiting today | **Admin API**                       |
| Categories: create, rename, delete | occasionally                       | **Admin API**                       |
| Product fields                     | occasionally                       | **Admin API**                       |
| **The category tree**              | **rarely** — structural            | **Playwright against the admin UI** |

The split is not a compromise; it follows the data. Memberships churn and have
an API. The tree is nearly static and has none.

### Why not one mechanism for both

**Not everything through the browser.** Filing 697 products through the admin
UI, at the 30s page stalls already measured on it, is roughly six hours and
several hundred chances to fail. The same work through `collects.json` is
minutes, idempotent, and verifiable. Driving a browser to do what an API
offers is choosing the slowest and least observable option available.

**Not everything through the API.** There is no API for the tree. This is not
a gap we have failed to find; there is no resource and no scope.

### Why Playwright and not an LLM agent

The target tree is known exactly, and so is the admin UI. That is a
deterministic job: scriptable, testable, and dry-runnable against a copy. An
LLM's value here would be resilience when Sapo changes its admin — real, but
secondary to being able to _test_ the thing. **Script first; an agent is the
fallback when the script breaks**, not the default.

`V6.15` rejected computer-use because it "cannot be dry-run, reports nothing".
That objection is answered not by improving the agent but by moving the
thinking out of it: the plan and the report are produced by this app, before
anything runs, and the executor decides nothing.

### Three rules that make it safe

1. **A publish never advances the mirror. Only a pull does.**
   `retro.md` already records the general form — _a pointer to "what we last
   saw" must not move past something **undecided**_. With a push it becomes
   **unconfirmed**. A write that merely looked successful, followed by an
   advanced mirror, makes the next pull read the stale remote value as an
   upstream change and revert the decision. That is the v6 bug exactly, and
   browser automation is the least trustworthy "success" there is. So: apply,
   then **re-fetch and diff**, and let the ordinary sync move the base.
2. **Structured drives execution; prose is output only.** The change set is a
   typed list. A human-readable summary is generated _from_ it, for the
   person about to approve it. The summary is never what the executor reads —
   the moment prose drives a write, a step gets invented.
3. **Status is per item, not per run.** A 210-item run will fail partway.
   `pending → applied → verified → failed` per item is what makes a re-run
   resume rather than redo or skip. That is an outbox, and it is what turns
   this from all-or-nothing into a job.

### What is still not written

`categories.parentId` is **never** sent to the Sapo API, because there is
nowhere to put it. It reaches Sapo only as menu structure, through lane two.
ADR-0003's "the sync never writes `parentId`" is unchanged and is now known to
be a property of the platform rather than a choice.

## Alternatives considered

**Metafields plus one theme change.** `CustomCollection` supports metafields
and themes are writable, so the parent could be stored as
`namespace: taxonomy, key: parent_id` and a Liquid snippet could build the
menu from those instead of `linklists`. This publishes the tree with a key and
no browser at all — genuinely the most elegant option.

Rejected for now because of what it costs: it means editing the customer's
live theme, and the storefront menu stops being editable from Sapo's own
admin. That is a permanent support commitment on someone else's storefront, in
exchange for automating something that changes a few times a year. Worth
revisiting if the tree turns out to change often, or if the operator would
rather own the menu than share it.

**Manual publishing.** The status quo: rebuild the menu by hand when it
changes. Zero risk and not unreasonable — but it is the tedium this project
exists to remove, and 210 links is where it hurts most.

**An LLM agent as the primary executor.** See above: untestable, and the
determinism is available.

## Consequences

**Good.** The reviewed selection `/reconcile` already computes becomes
actionable. The 697 get filed by an API call rather than by a person. And the
two lanes fail independently — a broken menu script does not stop memberships
publishing.

**Costly.** A new outbox table, a credentialed API client, a Playwright job
that runs outside the request cycle, and a read-back pass that doubles the
round trips. The publisher is a job, not a server action, and this is the
first part of the system that needs somewhere to run.

**Risky, and named.** This is the first outward-facing write in the project,
so a bad publish is customer-visible immediately. Three mitigations, all
required: **never delete**, **always dry-run first**, and **always verify by
reading back**. See the amendment below for what the blast radius actually
is — it is narrower than this ADR first assumed, and concentrated in one
field.

**Unchanged.** Sapo is still the system of record. This does not make the app
a co-equal writer; it makes a reviewed, human-approved decision able to
travel.

## Amendments

### 2026-09-02 — what actually reaches the marketplaces

This ADR was accepted the same day, citing "a store that also feeds Lazada,
Shopee, Tiki, TikTok Shop and Google Shopping". Two corrections, both from
reading Sapo's own docs rather than assuming.

**Only two fields propagate.** Every Sapo document that names them names the
same pair: _"đồng bộ thông tin **tồn kho** và **giá bán** của các sản phẩm từ
Sapo lên sàn"_ — stock and selling price, Sapo → marketplace, with orders
coming back the other way. Products are linked by **SKU match** against
listings that already exist on the marketplace; Sapo attaches to them rather
than creating them.

Name, description, images and **category** appear in no marketplace sync
document. Categories certainly do not travel — every marketplace enforces its
own mandatory taxonomy that has nothing to do with a Sapo collection.

(Not to be confused with **ShopeeFood**, a different Sapo integration, which
_does_ sync name, price, images and description. Reading one as the other is
an easy mistake.)

**So the blast radius is one field.** Of everything v8 would write:

|                                   | reaches a marketplace?              |
| --------------------------------- | ----------------------------------- |
| `collects` — memberships, the 697 | **no.** Storefront only             |
| `custom_collections` — categories | **no**                              |
| The menu tree (lane two)          | **no.** Storefront only             |
| `products/{id}.json` — **price**  | **yes**, to every connected channel |

Consequence for the build: **price is held out of the first cut** (`V8.13`),
behind its own explicit switch. That removes the only genuinely dangerous
field, which is a better mitigation than a warning paragraph.

**And the premise itself is unverified.** The claim that this store feeds
those channels has been repeated since the v4 spec and no evidence for it has
ever been recorded. The only marketplace references on the live storefront are
theme footer social icons pointing at `shopee.vn`, `lazada.vn` and
`tiktok.com` — generic homepages, not shop URLs, i.e. unconfigured theme
placeholders. Whether channels are actually connected is visible only in the
Sapo admin under **Kênh bán hàng / Sàn TMĐT**, which has not been checked.

This does not change the decision. It changes what the risk section is
entitled to assert, and it is a reminder that a sentence repeated four times
is not thereby verified.

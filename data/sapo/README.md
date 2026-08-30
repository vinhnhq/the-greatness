# `data/sapo/` — the live catalogue, cloned

A snapshot of the real product catalogue that currently lives in the Sapo
admin at **<https://the-greatness.mysapo.net/admin/products>**, pulled on
**2026-08-30** so the dashboard can be developed and demoed against real data
instead of `bun run seed`'s 30 invented products.

**Nothing here is loaded automatically.** These are inert files; wiring them
into a seed path is a separate, deliberate step (see _Bringing it in_ below).

Regenerate with:

```bash
bun run fetch:sapo            # JSON only
bun run fetch:sapo --images   # ...and re-download the image originals
```

## What is in the snapshot

|                        |                                                                  |
| ---------------------- | ---------------------------------------------------------------- |
| Products               | **832**                                                          |
| Categories             | **211** (20 hold products; 191 are empty)                        |
| Product↔category links | **280** — only **135 products** are in any category; 697 are not |
| Distinct images        | **786** (63 products have none)                                  |
| Variants               | **852** across 832 products; 17 products have more than one      |
| Vendors                | 51                                                               |

## Files

| File                      | Shape                                                        |
| ------------------------- | ------------------------------------------------------------ |
| `products.json`           | Array of products, camelCase, prices as integer VND.         |
| `categories.json`         | Array of categories, plus a `productCount`.                  |
| `product-categories.json` | Flat `{categorySourceId, productSourceId}` links.            |
| `images.json`             | One entry per distinct URL: `{url, file, usedBy[]}`.         |
| `images/`                 | The downloaded originals. **Gitignored** — ~212 MB.          |
| `raw/`                    | The API responses untouched, for when a mapping looks wrong. |

Every row carries a `sourceId` — the Sapo id — so a re-pull can be diffed
against an import rather than guessed at.

## Where it came from, and why that source

Sapo exposes two JSON surfaces. `/admin/*.json` needs a logged-in session
cookie; `/products.json` and `/collections.json` are public and need nothing.
They were compared row by row before choosing:

- Products: **832 either way.** The storefront is not hiding unpublished rows.
- Links: the admin reports 1112, the storefront 280. The 832-row difference is
  a **single collection, "Thuế 8%"** — a tax rule that contains every product
  and is not a category. Excluding it is the correct reading, not a loss.
- Collections: admin 213, storefront 211. The two extra are that tax rule and
  one more unpublished rule.

So `fetch-sapo.ts` uses the auth-free surface, which means it runs in CI or on
a fresh machine with no credentials. The script's docblock carries the detail.

## Facts worth knowing before you import

- **Prices are integer đồng.** ₫ has no minor unit, so `priceMinor` is the
  whole number `lib/money.ts` already expects with `currency: "VND"`. The
  script throws rather than round a fractional price.
- **160 products have a price of 0** and **298 have no description.** That is
  the state of the real catalogue, not a scraping failure.
- **Every product is `available: false`** — stock is 0 across the store, which
  the admin list shows too. Do not read it as a status field.
- **Most of the catalogue is uncategorised.** 697 of the 832 products belong
  to no category at all; the 135 that do sit mostly in the fan and
  rice-cooker branches. Any UI built on this data has to look right with an
  empty category column, and a category filter will hide five sixths of the
  catalogue.
- **Categories are flat.** Sapo has no parent column, and the store does not
  use one. The names imply a three-level tree ("Cảm biến & Điều khiển" →
  "Cảm biến cửa"), so `categories.parentId` could be reconstructed by hand —
  but that is an editorial judgement, not data, and this snapshot does not
  make it.
- **No category has a description**, and none has an image.
- **Three products share a name** with another; every slug is unique.
- Images are hosted on `bizweb.dktcdn.net` and the CDN **has no resized
  variants** — `_1024x1024`, `_grande` and a `/thumb/` path all 404. Full-size
  originals are the only thing on offer, which is why they are gitignored.
- The CDN **403s a request with no `User-Agent`**.

## Bringing it in

The export deliberately stops short of our schema so the mapping stays a
visible decision. What it lines up with:

| Snapshot                                 | `db-types.ts`                                                        |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `name`, `slug`, `sku`, `descriptionHtml` | `products.name/slug/sku/description`                                 |
| `priceMinor`, `currency`                 | `products.priceMinor/currency`                                       |
| —                                        | `products.status` — nothing in the source maps to it; pick a default |
| —                                        | `products.searchText` — the repository writes it, never the importer |
| `categories[].name/slug`                 | `categories.name/slug`                                               |
| `productCount`                           | not a column; drop it                                                |
| `product-categories.json`                | `product_categories`                                                 |
| `images[].url/file`                      | `media_assets.originUrl` + `product_media.position`                  |

Open questions an importer has to answer, none of which have an obvious
default:

1. **Variants.** 17 products have more than one, and `L.3` in the backlog says
   variants are a later spec. Flattening to the first variant loses real data;
   the snapshot keeps all of them so the decision stays open.
2. **`status`.** Nothing in the source maps to it.
3. **Media.** `media_assets` wants `bytes`, `width`, `height` and a `mime` —
   none of which the API gives. They have to come from the downloaded file.
4. **The empty 191 categories.** Import them or not? They are the intended
   taxonomy of the store, just unused so far.

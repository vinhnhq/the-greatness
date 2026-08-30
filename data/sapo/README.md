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

## It is loaded

`bun run seed` reads these files — see `src/db/seed-sapo.ts`, which records the
four calls it makes and why. The full pipeline from nothing:

```bash
bun run fetch:sapo --images    # the JSON and 786 CDN originals (~217 MB)
bun run prepare:sapo-media     # de-logo, resize, rename → data/sapo/media/
bun run db:reset               # migrate + seed
```

`media.json` is committed; `images/` and `media/` are not.

### What `prepare-sapo-media` does

- **Erases the "Tam Anh Tài" watermark** from the 255 images that carry it, by
  its three brand colours, and **only when the ring around the box is already
  white**. Four marketing banners (Shopee, WonderWear) use the same colours and
  are left alone by that check rather than having a white hole punched in them.
- **Writes the pair `media_assets` wants**, to the same numbers as
  `lib/media/optimize-image.ts`: an origin capped at 4096px, and a 1600px WebP
  at q82. An image that needed neither the erase nor the cap keeps its true
  bytes.
- **Names them after the product**: `<slug>-<n>-original.<ext>` and
  `<slug>-<n>.webp`, numbered even when a product has one image, so adding a
  second later renames nothing. That filename is also the storage key, so the
  URL in the database reads as the product.

786 origins are 230 MB; the 786 display copies are 19 MB.

### How it maps onto the schema

| Snapshot                          | `db-types.ts`                                             |
| --------------------------------- | --------------------------------------------------------- |
| `name`, `slug`, `sku`             | `products.name/slug/sku`                                  |
| `descriptionHtml`                 | `products.description`, **reduced to plain text**         |
| `priceMinor`, `currency`          | `products.priceMinor/currency`                            |
| `sourceId`                        | `products.sapoId` → the `Open in Sapo` link               |
| —                                 | `products.status` — all `active`; Sapo has no such field  |
| —                                 | `products.searchText` — computed with `productSearchText` |
| `categories[].name/slug/sourceId` | `categories.name/slug/sapoId`                             |
| `product-categories.json`         | `product_categories`                                      |
| `media.json`                      | `media_assets` + `product_media.position`                 |

Four judgement calls were made getting there, all recorded in
`src/db/seed-sapo.ts`:

1. **Description is the HTML reduced to text**, because the form's field is a
   textarea and Sapo is where the rich version is edited. The HTML stays here.
2. **`status` is `active` for everything.** `available` is not a status — it
   reads false on every product because stock is zero store-wide.
3. **A multi-variant product is one row** with its first variant's SKU.
   Backlog `L.3` defers variants; the other 35 stay in `products.json`.
4. **The 191 empty categories are imported.** They are the store's intended
   taxonomy, and a category with no products is a real state the UI should
   handle.

Two caps moved to fit the real data — `PRODUCT_NAME_MAX` 140 → 160 and
`PRODUCT_DESCRIPTION_MAX` 5,000 → 10,000. One real product name is 150
characters and the longest description is 8,550 once reduced to text; without
the change 185 real products could not be saved from the form.
